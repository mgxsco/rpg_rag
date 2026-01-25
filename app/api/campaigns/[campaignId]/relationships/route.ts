import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, relationships } from '@/lib/db'
import { eq, and, or } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

/**
 * Create a new relationship
 * POST /api/campaigns/{campaignId}/relationships
 *
 * Body: {
 *   sourceEntityId: string,
 *   targetEntityId: string,
 *   relationshipType: string,
 *   reverseLabel?: string
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
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
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id
  if (!isDM) {
    return new Response(JSON.stringify({ error: 'Only DMs can create relationships' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json()
    const { sourceEntityId, targetEntityId, relationshipType, reverseLabel } = body

    if (!sourceEntityId || !targetEntityId || !relationshipType) {
      return new Response(
        JSON.stringify({ error: 'sourceEntityId, targetEntityId, and relationshipType are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Verify both entities exist and belong to this campaign
    const [sourceEntity, targetEntity] = await Promise.all([
      db.query.entities.findFirst({
        where: and(
          eq(entities.id, sourceEntityId),
          eq(entities.campaignId, campaignId)
        ),
      }),
      db.query.entities.findFirst({
        where: and(
          eq(entities.id, targetEntityId),
          eq(entities.campaignId, campaignId)
        ),
      }),
    ])

    if (!sourceEntity) {
      return new Response(JSON.stringify({ error: 'Source entity not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!targetEntity) {
      return new Response(JSON.stringify({ error: 'Target entity not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if relationship already exists
    const existingRelationship = await db.query.relationships.findFirst({
      where: and(
        eq(relationships.sourceEntityId, sourceEntityId),
        eq(relationships.targetEntityId, targetEntityId),
        eq(relationships.relationshipType, relationshipType)
      ),
    })

    if (existingRelationship) {
      return new Response(
        JSON.stringify({ error: 'Relationship already exists', existing: existingRelationship }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create the relationship
    const relationshipId = uuidv4()
    await db.insert(relationships).values({
      id: relationshipId,
      campaignId: campaignId,
      sourceEntityId,
      targetEntityId,
      relationshipType,
      reverseLabel: reverseLabel || getDefaultReverseLabel(relationshipType),
    })

    console.log(`[Relationships] Created relationship: ${sourceEntity.name} --${relationshipType}--> ${targetEntity.name}`)

    return new Response(
      JSON.stringify({
        id: relationshipId,
        sourceEntityId,
        sourceEntityName: sourceEntity.name,
        targetEntityId,
        targetEntityName: targetEntity.name,
        relationshipType,
        reverseLabel: reverseLabel || getDefaultReverseLabel(relationshipType),
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Relationships] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to create relationship' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Get relationships for the campaign
 * GET /api/campaigns/{campaignId}/relationships?entityId=xxx
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entityId')

  try {
    let query
    if (entityId) {
      // Get relationships for a specific entity
      query = db.query.relationships.findMany({
        where: and(
          eq(relationships.campaignId, campaignId),
          or(
            eq(relationships.sourceEntityId, entityId),
            eq(relationships.targetEntityId, entityId)
          )
        ),
        with: {
          sourceEntity: {
            columns: { id: true, name: true, entityType: true },
          },
          targetEntity: {
            columns: { id: true, name: true, entityType: true },
          },
        },
      })
    } else {
      // Get all relationships (limited)
      query = db.query.relationships.findMany({
        where: eq(relationships.campaignId, campaignId),
        limit: 500,
        with: {
          sourceEntity: {
            columns: { id: true, name: true, entityType: true },
          },
          targetEntity: {
            columns: { id: true, name: true, entityType: true },
          },
        },
      })
    }

    const results = await query

    return new Response(
      JSON.stringify({ relationships: results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Relationships] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to get relationships' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Default reverse labels
function getDefaultReverseLabel(type: string): string {
  const reverseLabels: Record<string, string> = {
    lives_in: 'has_resident',
    member_of: 'has_member',
    owns: 'owned_by',
    created: 'created_by',
    enemy_of: 'enemy_of',
    ally_of: 'ally_of',
    located_in: 'contains',
    knows: 'known_by',
    serves: 'served_by',
    rules: 'ruled_by',
    parent_of: 'child_of',
    child_of: 'parent_of',
    sibling_of: 'sibling_of',
    married_to: 'married_to',
    works_for: 'employs',
    killed: 'killed_by',
    killed_by: 'killed',
    worships: 'worshipped_by',
    guards: 'guarded_by',
    seeks: 'sought_by',
    fears: 'feared_by',
    loves: 'loved_by',
    hates: 'hated_by',
    contains: 'contained_in',
    part_of: 'has_part',
    visited: 'visited_by',
    related_to: 'related_to',
  }
  return reverseLabels[type] || `has_${type}`
}
