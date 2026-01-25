import { NextRequest, NextResponse } from 'next/server'
import { db, entities, characterKnowledge, campaignMembers } from '@/lib/db'
import { eq, and, inArray } from 'drizzle-orm'
import { withCampaignAuth, withDMAuth } from '@/lib/api/auth'

type Params = { campaignId: string }

/**
 * Get knowledge for a character
 * GET /api/campaigns/{campaignId}/knowledge?characterId={id}
 */
export const GET = withCampaignAuth<Params>(async (request, { access, campaignId, user }) => {
  const { searchParams } = new URL(request.url)
  const characterId = searchParams.get('characterId')

  if (!characterId) {
    return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
  }

  // Verify the character exists and belongs to this campaign
  const character = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, characterId),
      eq(entities.campaignId, campaignId)
    ),
  })

  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  // For non-DMs, verify they own this character
  if (!access.isDM) {
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, user.id)
      ),
    })

    if (character.playerId !== membership?.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // Get all knowledge entries for this character
  const knowledge = await db.query.characterKnowledge.findMany({
    where: eq(characterKnowledge.characterId, characterId),
  })

  // Get the known entity details
  const knownEntityIds = knowledge.map((k) => k.entityId)
  let knownEntities: typeof entities.$inferSelect[] = []

  if (knownEntityIds.length > 0) {
    knownEntities = await db.query.entities.findMany({
      where: and(
        eq(entities.campaignId, campaignId),
        inArray(entities.id, knownEntityIds)
      ),
    })

    // Filter DM-only for non-DMs
    if (!access.isDM) {
      knownEntities = knownEntities.filter((e) => !e.isDmOnly)
    }
  }

  // Build response with knowledge details
  const knowledgeWithDetails = knowledge
    .map((k) => {
      const entity = knownEntities.find((e) => e.id === k.entityId)
      if (!entity) return null
      return {
        ...k,
        entity: {
          id: entity.id,
          name: entity.name,
          entityType: entity.entityType,
        },
      }
    })
    .filter(Boolean)

  return NextResponse.json({
    characterId,
    characterName: character.name,
    knowledge: knowledgeWithDetails,
    knownEntityIds: knownEntities.map((e) => e.id),
    total: knowledgeWithDetails.length,
  })
})

/**
 * Add knowledge to a character (DM only)
 * POST /api/campaigns/{campaignId}/knowledge
 */
export const POST = withDMAuth<Params>(async (request, { campaignId }) => {
  const body = await request.json()
  const { characterId, entityIds, sessionId, notes } = body as {
    characterId: string
    entityIds: string[]
    sessionId?: string
    notes?: string
  }

  if (!characterId || !entityIds || entityIds.length === 0) {
    return NextResponse.json(
      { error: 'characterId and entityIds are required' },
      { status: 400 }
    )
  }

  // Verify the character exists
  const character = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, characterId),
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'player_character')
    ),
  })

  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  // Verify all entities exist
  const entitiesToAdd = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      inArray(entities.id, entityIds)
    ),
  })

  if (entitiesToAdd.length === 0) {
    return NextResponse.json({ error: 'No valid entities found' }, { status: 400 })
  }

  // Get existing knowledge to avoid duplicates
  const existingKnowledge = await db.query.characterKnowledge.findMany({
    where: and(
      eq(characterKnowledge.characterId, characterId),
      inArray(characterKnowledge.entityId, entityIds)
    ),
  })

  const existingEntityIds = new Set(existingKnowledge.map((k) => k.entityId))
  const newEntityIds = entityIds.filter((id) => !existingEntityIds.has(id))

  if (newEntityIds.length === 0) {
    return NextResponse.json({
      message: 'All entities already known',
      added: 0,
    })
  }

  // Add new knowledge entries
  const validNewIds = newEntityIds.filter((id) =>
    entitiesToAdd.some((e) => e.id === id)
  )

  await db.insert(characterKnowledge).values(
    validNewIds.map((entityId) => ({
      characterId,
      entityId,
      sessionId: sessionId || null,
      notes: notes || null,
    }))
  )

  return NextResponse.json({
    message: 'Knowledge added successfully',
    added: validNewIds.length,
    entityIds: validNewIds,
  })
})

/**
 * Remove knowledge from a character (DM only)
 * DELETE /api/campaigns/{campaignId}/knowledge
 */
export const DELETE = withDMAuth<Params>(async (request, { campaignId }) => {
  const body = await request.json()
  const { characterId, entityIds } = body as {
    characterId: string
    entityIds: string[]
  }

  if (!characterId || !entityIds || entityIds.length === 0) {
    return NextResponse.json(
      { error: 'characterId and entityIds are required' },
      { status: 400 }
    )
  }

  // Verify the character exists
  const character = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, characterId),
      eq(entities.campaignId, campaignId)
    ),
  })

  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  // Delete knowledge entries
  for (const entityId of entityIds) {
    await db
      .delete(characterKnowledge)
      .where(
        and(
          eq(characterKnowledge.characterId, characterId),
          eq(characterKnowledge.entityId, entityId)
        )
      )
  }

  return NextResponse.json({
    message: 'Knowledge removed successfully',
    removed: entityIds.length,
  })
})
