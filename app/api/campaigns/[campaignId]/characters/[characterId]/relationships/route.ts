import { NextRequest, NextResponse } from 'next/server'
import { db, entities, relationships } from '@/lib/db'
import { eq, and, or } from 'drizzle-orm'
import { withCampaignAuth } from '@/lib/api/auth'

type Params = { campaignId: string; characterId: string }

interface RelationshipWithEntity {
  id: string
  relationshipType: string
  reverseLabel: string | null
  sentiment: string | null
  entity: {
    id: string
    name: string
    entityType: string
    content: string | null
    isDmOnly: boolean
  }
  direction: 'outgoing' | 'incoming'
}

/**
 * Get all relationships for a specific character
 * GET /api/campaigns/{campaignId}/characters/{characterId}/relationships
 * Returns NPCs and other entities grouped by relationship type and sentiment
 */
export const GET = withCampaignAuth<Params>(async (request, { access, campaignId }, params) => {
  const { characterId } = params

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

  // Get all relationships where this character is source or target
  const allRelationships = await db.query.relationships.findMany({
    where: and(
      eq(relationships.campaignId, campaignId),
      or(
        eq(relationships.sourceEntityId, characterId),
        eq(relationships.targetEntityId, characterId)
      )
    ),
  })

  // Get all related entity IDs
  const relatedEntityIds = new Set<string>()
  for (const rel of allRelationships) {
    if (rel.sourceEntityId === characterId) {
      relatedEntityIds.add(rel.targetEntityId)
    } else {
      relatedEntityIds.add(rel.sourceEntityId)
    }
  }

  // Fetch all related entities
  const relatedEntities = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
  })

  const entityMap = new Map(relatedEntities.map((e) => [e.id, e]))

  // Build the relationships with entity data
  const relationshipsWithEntities: RelationshipWithEntity[] = []

  for (const rel of allRelationships) {
    const isOutgoing = rel.sourceEntityId === characterId
    const relatedEntityId = isOutgoing ? rel.targetEntityId : rel.sourceEntityId
    const relatedEntity = entityMap.get(relatedEntityId)

    if (!relatedEntity) continue

    // Filter DM-only entities for non-DMs
    if (!access.isDM && relatedEntity.isDmOnly) continue

    relationshipsWithEntities.push({
      id: rel.id,
      relationshipType: rel.relationshipType,
      reverseLabel: rel.reverseLabel,
      sentiment: rel.sentiment,
      entity: {
        id: relatedEntity.id,
        name: relatedEntity.name,
        entityType: relatedEntity.entityType,
        content: relatedEntity.content?.slice(0, 500) || null,
        isDmOnly: relatedEntity.isDmOnly || false,
      },
      direction: isOutgoing ? 'outgoing' : 'incoming',
    })
  }

  // Group by sentiment
  const bySentiment = {
    friendly: relationshipsWithEntities.filter((r) => r.sentiment === 'friendly'),
    neutral: relationshipsWithEntities.filter((r) => r.sentiment === 'neutral' || !r.sentiment),
    hostile: relationshipsWithEntities.filter((r) => r.sentiment === 'hostile'),
    unknown: relationshipsWithEntities.filter((r) => r.sentiment === 'unknown'),
  }

  // Group by entity type
  const npcs = relationshipsWithEntities.filter((r) => r.entity.entityType === 'npc')
  const locations = relationshipsWithEntities.filter((r) => r.entity.entityType === 'location')
  const factions = relationshipsWithEntities.filter((r) => r.entity.entityType === 'faction')
  const others = relationshipsWithEntities.filter(
    (r) => !['npc', 'location', 'faction'].includes(r.entity.entityType)
  )

  return NextResponse.json({
    character: {
      id: character.id,
      name: character.name,
      entityType: character.entityType,
    },
    relationships: relationshipsWithEntities,
    bySentiment,
    byType: {
      npcs,
      locations,
      factions,
      others,
    },
    stats: {
      total: relationshipsWithEntities.length,
      friendly: bySentiment.friendly.length,
      neutral: bySentiment.neutral.length,
      hostile: bySentiment.hostile.length,
      npcs: npcs.length,
    },
  })
})
