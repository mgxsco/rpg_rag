import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { StagedEntity, StagedRelationship } from '@/lib/types'

/**
 * Process relationships from accepted entities
 * POST /api/campaigns/{campaignId}/extract-step/relationships
 *
 * Body: {
 *   acceptedEntities: StagedEntity[],
 *   rawRelationships: Array<{
 *     sourceEntity: string,
 *     targetEntity: string,
 *     relationshipType: string,
 *     reverseLabel?: string,
 *     excerpt?: string
 *   }>[]
 * }
 *
 * Returns: { relationships: StagedRelationship[] }
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json()
    const { acceptedEntities, rawRelationships } = body

    if (!acceptedEntities || !Array.isArray(acceptedEntities)) {
      return new Response(JSON.stringify({ error: 'Accepted entities are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build name to tempId lookup from accepted entities
    const nameToTempId = new Map<string, string>()
    const nameToEntity = new Map<string, StagedEntity>()

    for (const entity of acceptedEntities) {
      nameToTempId.set(entity.name.toLowerCase(), entity.tempId)
      nameToEntity.set(entity.name.toLowerCase(), entity)

      // Also add aliases
      if (entity.aliases) {
        for (const alias of entity.aliases) {
          nameToTempId.set(alias.toLowerCase(), entity.tempId)
          nameToEntity.set(alias.toLowerCase(), entity)
        }
      }
    }

    // Flatten all raw relationships from all chunks
    const allRawRelationships = rawRelationships?.flat() || []

    // Process relationships, matching to accepted entities
    const stagedRelationships: StagedRelationship[] = []
    const seenRelationships = new Set<string>()

    for (const rel of allRawRelationships) {
      const sourceKey = rel.sourceEntity?.toLowerCase()
      const targetKey = rel.targetEntity?.toLowerCase()

      if (!sourceKey || !targetKey) continue

      const sourceTempId = nameToTempId.get(sourceKey)
      const targetTempId = nameToTempId.get(targetKey)

      // Only include relationships where both entities are accepted
      if (!sourceTempId || !targetTempId) continue

      // Deduplicate
      const relationshipKey = `${sourceTempId}-${rel.relationshipType}-${targetTempId}`
      if (seenRelationships.has(relationshipKey)) continue
      seenRelationships.add(relationshipKey)

      const sourceEntity = nameToEntity.get(sourceKey)
      const targetEntity = nameToEntity.get(targetKey)

      stagedRelationships.push({
        tempId: uuidv4(),
        sourceEntityTempId: sourceTempId,
        targetEntityTempId: targetTempId,
        sourceEntityName: sourceEntity?.name || rel.sourceEntity,
        targetEntityName: targetEntity?.name || rel.targetEntity,
        relationshipType: rel.relationshipType,
        reverseLabel: rel.reverseLabel || getDefaultReverseLabel(rel.relationshipType),
        excerpt: rel.excerpt || '',
        status: 'pending' as const,
      })
    }

    console.log(`[Extract-Relationships] Created ${stagedRelationships.length} relationships from ${allRawRelationships.length} raw`)

    return new Response(
      JSON.stringify({ relationships: stagedRelationships }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Extract-Relationships] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Processing failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Get default reverse label for relationship type
function getDefaultReverseLabel(type: string): string {
  const reverseLabels: Record<string, string> = {
    lives_in: 'has_resident',
    member_of: 'has_member',
    owns: 'owned_by',
    created: 'created_by',
    enemy_of: 'enemy_of',
    ally_of: 'ally_of',
    located_in: 'contains',
    participated_in: 'had_participant',
    mentioned_in: 'mentions',
    related_to: 'related_to',
    knows: 'known_by',
    serves: 'served_by',
    rules: 'ruled_by',
    guards: 'guarded_by',
    seeks: 'sought_by',
    fears: 'feared_by',
    loves: 'loved_by',
    hates: 'hated_by',
    works_for: 'employs',
    parent_of: 'child_of',
    child_of: 'parent_of',
    sibling_of: 'sibling_of',
    married_to: 'married_to',
    worships: 'worshipped_by',
    leads: 'led_by',
    follows: 'followed_by',
    created_by: 'created',
    contains: 'contained_in',
    part_of: 'has_part',
    killed_by: 'killed',
    killed: 'killed_by',
    visited: 'visited_by',
    hired_by: 'hired',
    attacked: 'attacked_by',
  }

  return reverseLabels[type] || `has_${type}`
}
