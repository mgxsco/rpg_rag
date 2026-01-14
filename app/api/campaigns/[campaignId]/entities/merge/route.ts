import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, entities, relationships } from '@/lib/db'
import { eq, and, or } from 'drizzle-orm'
import { syncEntityEmbeddings, deleteEntityChunks } from '@/lib/ai/entity-embeddings'
import { checkCampaignAccess, isAccessError } from '@/lib/api/access'

/**
 * Merge two entities into one
 * POST /api/campaigns/{campaignId}/entities/merge
 * Body: { primaryEntityId, secondaryEntityId }
 *
 * The primary entity will keep its ID and receive:
 * - Concatenated content from secondary
 * - Merged aliases
 * - Transferred relationships
 * The secondary entity will be deleted.
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Only DM can merge
  if (!access.isDM) {
    return NextResponse.json({ error: 'Only DM can merge entities' }, { status: 403 })
  }

  const body = await request.json()
  const { primaryEntityId, secondaryEntityId } = body

  if (!primaryEntityId || !secondaryEntityId) {
    return NextResponse.json(
      { error: 'Both primaryEntityId and secondaryEntityId are required' },
      { status: 400 }
    )
  }

  if (primaryEntityId === secondaryEntityId) {
    return NextResponse.json(
      { error: 'Cannot merge an entity with itself' },
      { status: 400 }
    )
  }

  // Get both entities
  const primaryEntity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, primaryEntityId),
      eq(entities.campaignId, params.campaignId)
    ),
  })

  const secondaryEntity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, secondaryEntityId),
      eq(entities.campaignId, params.campaignId)
    ),
  })

  if (!primaryEntity) {
    return NextResponse.json({ error: 'Primary entity not found' }, { status: 404 })
  }

  if (!secondaryEntity) {
    return NextResponse.json({ error: 'Secondary entity not found' }, { status: 404 })
  }

  try {
    // 1. Concatenate content
    const newContent = primaryEntity.content
      ? `${primaryEntity.content}\n\n---\n\n*Merged from ${secondaryEntity.name}:*\n\n${secondaryEntity.content || ''}`
      : secondaryEntity.content || ''

    // 2. Merge aliases (unique set, excluding primary's name/canonicalName)
    const allAliases = new Set([
      ...(primaryEntity.aliases || []),
      secondaryEntity.name,
      secondaryEntity.canonicalName,
      ...(secondaryEntity.aliases || []),
    ])
    // Remove primary's own name and canonicalName from aliases
    allAliases.delete(primaryEntity.name)
    allAliases.delete(primaryEntity.canonicalName)
    const newAliases = Array.from(allAliases).filter(Boolean)

    // 3. Merge tags
    const allTags = new Set([
      ...(primaryEntity.tags || []),
      ...(secondaryEntity.tags || []),
    ])
    const newTags = Array.from(allTags).filter(Boolean)

    // 4. Transfer relationships from secondary to primary
    // Update outgoing relationships (secondary as source)
    await db
      .update(relationships)
      .set({ sourceEntityId: primaryEntityId })
      .where(eq(relationships.sourceEntityId, secondaryEntityId))

    // Update incoming relationships (secondary as target)
    await db
      .update(relationships)
      .set({ targetEntityId: primaryEntityId })
      .where(eq(relationships.targetEntityId, secondaryEntityId))

    // 5. Update wikilinks in all campaign entities
    // Find entities that reference the secondary entity by name or aliases
    const searchTerms = [
      secondaryEntity.name,
      secondaryEntity.canonicalName,
      ...(secondaryEntity.aliases || []),
    ].filter(Boolean)

    const allCampaignEntities = await db.query.entities.findMany({
      where: eq(entities.campaignId, params.campaignId),
    })

    // Update each entity's content to replace [[SecondaryName]] with [[PrimaryName]]
    for (const entity of allCampaignEntities) {
      if (entity.id === secondaryEntityId) continue // Skip the entity being merged
      if (!entity.content) continue

      let updatedContent = entity.content
      let hasChanges = false

      for (const term of searchTerms) {
        // Case-insensitive replacement of wikilinks
        const regex = new RegExp(`\\[\\[${escapeRegex(term)}\\]\\]`, 'gi')
        if (regex.test(updatedContent)) {
          updatedContent = updatedContent.replace(regex, `[[${primaryEntity.name}]]`)
          hasChanges = true
        }
      }

      if (hasChanges) {
        await db
          .update(entities)
          .set({ content: updatedContent, updatedAt: new Date() })
          .where(eq(entities.id, entity.id))
      }
    }

    // 6. Update the primary entity
    const [updatedPrimary] = await db
      .update(entities)
      .set({
        content: newContent,
        aliases: newAliases,
        tags: newTags,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, primaryEntityId))
      .returning()

    // 7. Delete secondary entity's chunks
    await deleteEntityChunks(secondaryEntityId)

    // 8. Delete secondary entity (cascades to relationships, sources, versions)
    await db.delete(entities).where(eq(entities.id, secondaryEntityId))

    // 9. Re-sync embeddings for the merged primary entity
    try {
      await syncEntityEmbeddings(
        updatedPrimary.id,
        params.campaignId,
        updatedPrimary.name,
        updatedPrimary.content || ''
      )
    } catch (error) {
      console.error('[Merge] Error syncing embeddings:', error)
    }

    return NextResponse.json({
      success: true,
      entity: updatedPrimary,
      merged: {
        primaryName: primaryEntity.name,
        secondaryName: secondaryEntity.name,
      },
    })
  } catch (error) {
    console.error('[Merge] Error merging entities:', error)
    return NextResponse.json(
      { error: 'Failed to merge entities' },
      { status: 500 }
    )
  }
}

// Helper to escape special regex characters
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
