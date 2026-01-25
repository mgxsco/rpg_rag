import { NextRequest, NextResponse } from 'next/server'
import { db, entities, relationships, entitySources } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { checkPublicCampaignAccess, isPublicAccessError } from '@/lib/api/public-access'

type Params = { slug: string; entityId: string }

/**
 * Get a single public entity with relationships and backlinks
 * GET /api/public/campaigns/{slug}/entities/{entityId}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  const access = await checkPublicCampaignAccess(params.slug)

  if (isPublicAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { campaign } = access

  // Get the entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, campaign.id)
    ),
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      entityType: true,
      content: true,
      aliases: true,
      tags: true,
      isDmOnly: true,
      sessionNumber: true,
      sessionDate: true,
      inGameDate: true,
      sessionStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  // Reject DM-only entities
  if (entity.isDmOnly) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  // Get all non-DM-only entities for relationship and backlink lookups
  const allPublicEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.isDmOnly, false)
    ),
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      entityType: true,
      content: true,
    },
  })

  const publicEntityIds = new Set(allPublicEntities.map((e) => e.id))

  // Get outgoing relationships (only to public entities)
  const outgoingRelationships = await db.query.relationships.findMany({
    where: eq(relationships.sourceEntityId, params.entityId),
    with: {
      targetEntity: {
        columns: {
          id: true,
          name: true,
          canonicalName: true,
          entityType: true,
          isDmOnly: true,
        },
      },
    },
  })

  const filteredOutgoing = outgoingRelationships
    .filter((r) => publicEntityIds.has(r.targetEntityId))
    .map((r) => ({
      id: r.id,
      type: r.relationshipType,
      reverseLabel: r.reverseLabel,
      target: {
        id: r.targetEntity.id,
        name: r.targetEntity.name,
        canonicalName: r.targetEntity.canonicalName,
        entityType: r.targetEntity.entityType,
      },
    }))

  // Get incoming relationships (only from public entities)
  const incomingRelationships = await db.query.relationships.findMany({
    where: eq(relationships.targetEntityId, params.entityId),
    with: {
      sourceEntity: {
        columns: {
          id: true,
          name: true,
          canonicalName: true,
          entityType: true,
          isDmOnly: true,
        },
      },
    },
  })

  const filteredIncoming = incomingRelationships
    .filter((r) => publicEntityIds.has(r.sourceEntityId))
    .map((r) => ({
      id: r.id,
      type: r.relationshipType,
      reverseLabel: r.reverseLabel,
      source: {
        id: r.sourceEntity.id,
        name: r.sourceEntity.name,
        canonicalName: r.sourceEntity.canonicalName,
        entityType: r.sourceEntity.entityType,
      },
    }))

  // Find content backlinks (public entities that mention this one via [[wikilinks]])
  const searchTerms = [entity.name, ...(entity.aliases || [])]
  const contentBacklinks = allPublicEntities.filter((e) => {
    if (e.id === entity.id) return false
    const content = e.content?.toLowerCase() || ''
    return searchTerms.some(
      (term) =>
        content.includes(`[[${term.toLowerCase()}]]`) ||
        content.includes(`[[${term}]]`)
    )
  }).map((e) => ({
    id: e.id,
    name: e.name,
    canonicalName: e.canonicalName,
    entityType: e.entityType,
  }))

  // Remove content and isDmOnly from entity response
  const { isDmOnly, ...entityResponse } = entity

  return NextResponse.json({
    entity: entityResponse,
    outgoingRelationships: filteredOutgoing,
    incomingRelationships: filteredIncoming,
    contentBacklinks,
  })
}
