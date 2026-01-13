import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  db,
  entities,
  campaigns,
  campaignMembers,
  relationships,
  entitySources,
  entityVersions,
  chunks,
} from '@/lib/db'
import { eq, and, or } from 'drizzle-orm'
import { syncEntityEmbeddings, deleteEntityChunks } from '@/lib/ai/entity-embeddings'

async function checkAccess(campaignId: string, userId: string) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return { error: 'Campaign not found', status: 404 }
  }

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  })

  const isOwner = campaign.ownerId === userId
  const isDM = membership?.role === 'dm' || isOwner

  if (!membership && !isOwner) {
    return { error: 'Access denied', status: 403 }
  }

  return { campaign, isDM, membership }
}

/**
 * Get a single entity with all its relationships and backlinks
 * GET /api/campaigns/{campaignId}/entities/{entityId}
 */
export async function GET(
  request: Request,
  { params }: { params: { campaignId: string; entityId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkAccess(params.campaignId, session.user.id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Get the entity with player info
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, params.campaignId)
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

  // Get outgoing relationships (this entity -> other)
  const outgoingRelationships = await db.query.relationships.findMany({
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
  })

  // Get incoming relationships (other -> this entity) - these are backlinks
  const incomingRelationships = await db.query.relationships.findMany({
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
  })

  // Get source documents
  const sources = await db.query.entitySources.findMany({
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
  })

  // Find entities that mention this one in their content (additional backlinks)
  // Look for [[EntityName]] or aliases in content
  const searchTerms = [entity.name, ...(entity.aliases || [])]
  const contentBacklinks = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, params.campaignId),
      or(
        ...searchTerms.map((term) =>
          // Search for wikilink references
          eq(
            entities.id,
            entities.id // placeholder - we'll filter in JS
          )
        )
      )
    ),
  })

  // Filter content backlinks (entities that mention this entity)
  const backlinkEntities = contentBacklinks.filter((e) => {
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
}

/**
 * Update an entity
 * PUT /api/campaigns/{campaignId}/entities/{entityId}
 */
export async function PUT(
  request: Request,
  { params }: { params: { campaignId: string; entityId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkAccess(params.campaignId, session.user.id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Get the entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, params.campaignId)
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
    editedBy: session.user.id,
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
        eq(entities.campaignId, params.campaignId),
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
        params.campaignId,
        updated.name,
        updated.content || ''
      )
    } catch (error) {
      console.error('[Entities] Error syncing embeddings:', error)
    }
  }

  return NextResponse.json(updated)
}

/**
 * Delete an entity
 * DELETE /api/campaigns/{campaignId}/entities/{entityId}
 */
export async function DELETE(
  request: Request,
  { params }: { params: { campaignId: string; entityId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkAccess(params.campaignId, session.user.id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Only DM can delete
  if (!access.isDM) {
    return NextResponse.json({ error: 'Only DM can delete entities' }, { status: 403 })
  }

  // Get the entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, params.campaignId)
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
}
