import { NextRequest, NextResponse } from 'next/server'
import {
  db,
  entities,
  relationships,
  entitySources,
  entityVersions,
} from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { syncEntityEmbeddings, deleteEntityChunks } from '@/lib/ai/entity-embeddings'
import { withCampaignAuth, withDMAuth } from '@/lib/api/auth'

type Params = { campaignId: string; entityId: string }

/**
 * Get a single entity with all its relationships and backlinks
 * GET /api/campaigns/{campaignId}/entities/{entityId}
 */
export const GET = withCampaignAuth<Params>(async (request, { access, campaignId }, params) => {
  // Get the entity with player info
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, campaignId)
    ),
    with: {
      player: {
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  })

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  // Check DM-only access
  if (entity.isDmOnly && !access.isDM) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Run all independent queries in parallel for better performance
  const searchTerms = [entity.name, ...(entity.aliases || [])]

  const [outgoingRelationships, incomingRelationships, sources, allCampaignEntities] = await Promise.all([
    // Get outgoing relationships (this entity -> other)
    db.query.relationships.findMany({
      where: eq(relationships.sourceEntityId, params.entityId),
      with: {
        targetEntity: {
          columns: {
            id: true,
            name: true,
            canonicalName: true,
            entityType: true,
          },
        },
      },
    }),
    // Get incoming relationships (other -> this entity) - these are backlinks
    db.query.relationships.findMany({
      where: eq(relationships.targetEntityId, params.entityId),
      with: {
        sourceEntity: {
          columns: {
            id: true,
            name: true,
            canonicalName: true,
            entityType: true,
          },
        },
      },
    }),
    // Get source documents
    db.query.entitySources.findMany({
      where: eq(entitySources.entityId, params.entityId),
      with: {
        document: {
          columns: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
      },
    }),
    // Get all campaign entities for content backlink search
    // Note: For large campaigns, consider using PostgreSQL full-text search
    db.query.entities.findMany({
      where: eq(entities.campaignId, campaignId),
      columns: {
        id: true,
        name: true,
        canonicalName: true,
        entityType: true,
        content: true,
      },
    }),
  ])

  // Filter content backlinks (entities that mention this entity in wikilinks)
  const backlinkEntities = allCampaignEntities.filter((e) => {
    if (e.id === entity.id) return false
    const content = e.content?.toLowerCase() || ''
    return searchTerms.some(
      (term) =>
        content.includes(`[[${term.toLowerCase()}]]`) ||
        content.includes(`[[${term}]]`)
    )
  })

  return NextResponse.json({
    entity,
    outgoingRelationships: outgoingRelationships.map((r) => ({
      id: r.id,
      type: r.relationshipType,
      reverseLabel: r.reverseLabel,
      target: r.targetEntity,
    })),
    incomingRelationships: incomingRelationships.map((r) => ({
      id: r.id,
      type: r.relationshipType,
      reverseLabel: r.reverseLabel,
      source: r.sourceEntity,
    })),
    contentBacklinks: backlinkEntities.map((e) => ({
      id: e.id,
      name: e.name,
      canonicalName: e.canonicalName,
      entityType: e.entityType,
    })),
    sources: sources.map((s) => ({
      id: s.id,
      document: s.document,
      excerpt: s.excerpt,
      confidence: s.confidence,
    })),
    isDM: access.isDM,
  })
})

/**
 * Update an entity
 * PUT /api/campaigns/{campaignId}/entities/{entityId}
 */
export const PUT = withCampaignAuth<Params>(async (request, { user, campaignId }, params) => {
  // Get the entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, campaignId)
    ),
  })

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  const body = await request.json()
  const { name, entityType, content, aliases, tags, isDmOnly, playerId } = body

  // Save current version before updating
  await db.insert(entityVersions).values({
    entityId: entity.id,
    name: entity.name,
    content: entity.content || '',
    editedBy: user.id,
  })

  // Update canonical name if name changed
  let canonicalName = entity.canonicalName
  if (name && name !== entity.name) {
    canonicalName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Check for duplicate
    const existing = await db.query.entities.findFirst({
      where: and(
        eq(entities.campaignId, campaignId),
        eq(entities.canonicalName, canonicalName)
      ),
    })

    if (existing && existing.id !== entity.id) {
      return NextResponse.json(
        { error: 'An entity with this name already exists' },
        { status: 400 }
      )
    }
  }

  // Determine the final entity type
  const finalEntityType = entityType || entity.entityType

  // Update the entity
  const [updated] = await db
    .update(entities)
    .set({
      name: name || entity.name,
      canonicalName,
      entityType: finalEntityType,
      content: content !== undefined ? content : entity.content,
      aliases: aliases !== undefined ? aliases : entity.aliases,
      tags: tags !== undefined ? tags : entity.tags,
      isDmOnly: isDmOnly !== undefined ? isDmOnly : entity.isDmOnly,
      playerId: finalEntityType === 'player_character'
        ? (playerId !== undefined ? playerId : entity.playerId)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, params.entityId))
    .returning()

  // Re-sync embeddings if content changed
  if (content !== undefined && content !== entity.content) {
    try {
      await syncEntityEmbeddings(
        updated.id,
        campaignId,
        updated.name,
        updated.content || ''
      )
    } catch (error) {
      console.error('[Entities] Error syncing embeddings:', error)
    }
  }

  return NextResponse.json(updated)
})

/**
 * Delete an entity
 * DELETE /api/campaigns/{campaignId}/entities/{entityId}
 */
export const DELETE = withDMAuth<Params>(async (request, { campaignId }, params) => {
  // Get the entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, campaignId)
    ),
  })

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  // Delete chunks (embeddings)
  await deleteEntityChunks(params.entityId)

  // Delete the entity (cascades to relationships, sources, versions)
  await db.delete(entities).where(eq(entities.id, params.entityId))

  return NextResponse.json({ success: true, deleted: entity.name })
})
