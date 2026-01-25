import { NextRequest, NextResponse } from 'next/server'
import { db, entities, relationships, campaignMembers } from '@/lib/db'
import { eq, and, or, inArray } from 'drizzle-orm'
import { withCampaignAuth } from '@/lib/api/auth'

type Params = { campaignId: string }

/**
 * Get all quests for a campaign
 * GET /api/campaigns/{campaignId}/quests
 * Query params:
 *   - status: Filter by quest status (active, completed, failed, abandoned)
 *   - characterId: Filter quests related to a specific character
 */
export const GET = withCampaignAuth<Params>(async (request, { access, campaignId }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const characterId = searchParams.get('characterId')

  // Get all quests
  let quests = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'quest')
    ),
    orderBy: (entities, { desc }) => [desc(entities.updatedAt)],
  })

  // Filter DM-only quests for non-DMs
  if (!access.isDM) {
    quests = quests.filter((q) => !q.isDmOnly)
  }

  // Filter by status if specified
  if (status && status !== 'all') {
    quests = quests.filter((q) => q.questStatus === status)
  }

  // If characterId is specified, filter quests that are related to that character
  if (characterId) {
    // Get relationships where the character is involved
    const characterRelations = await db.query.relationships.findMany({
      where: and(
        eq(relationships.campaignId, campaignId),
        or(
          eq(relationships.sourceEntityId, characterId),
          eq(relationships.targetEntityId, characterId)
        )
      ),
    })

    // Get the quest IDs that are connected to the character
    const relatedQuestIds = new Set<string>()
    for (const rel of characterRelations) {
      if (rel.sourceEntityId === characterId) {
        relatedQuestIds.add(rel.targetEntityId)
      } else {
        relatedQuestIds.add(rel.sourceEntityId)
      }
    }

    // Filter to only quests that are related to the character
    quests = quests.filter((q) => relatedQuestIds.has(q.id))
  }

  // Count by status
  const stats = {
    active: quests.filter((q) => q.questStatus === 'active' || !q.questStatus).length,
    completed: quests.filter((q) => q.questStatus === 'completed').length,
    failed: quests.filter((q) => q.questStatus === 'failed').length,
    abandoned: quests.filter((q) => q.questStatus === 'abandoned').length,
    total: quests.length,
  }

  return NextResponse.json({
    quests,
    stats,
    isDM: access.isDM,
  })
})

/**
 * Update quest status
 * PUT /api/campaigns/{campaignId}/quests
 */
export const PUT = withCampaignAuth<Params>(async (request, { access, campaignId }) => {
  const body = await request.json()
  const { questId, questStatus } = body

  if (!questId) {
    return NextResponse.json({ error: 'Quest ID required' }, { status: 400 })
  }

  // Verify quest exists and belongs to this campaign
  const quest = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, questId),
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'quest')
    ),
  })

  if (!quest) {
    return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
  }

  // Only DM can change quest status
  if (!access.isDM) {
    return NextResponse.json({ error: 'Only DM can update quest status' }, { status: 403 })
  }

  const [updated] = await db
    .update(entities)
    .set({
      questStatus,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, questId))
    .returning()

  return NextResponse.json(updated)
})
