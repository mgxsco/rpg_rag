import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, relationships } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateSimple } from '@/lib/ai/client'
import { getCampaignSettings } from '@/lib/campaign-settings'
import type { AIModel } from '@/lib/db/schema'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

interface RelationshipSuggestion {
  sourceEntityId: string
  sourceEntityName: string
  sourceEntityType: string
  targetEntityId: string
  targetEntityName: string
  targetEntityType: string
  relationshipType: string
  reverseLabel: string
  reason: string
}

/**
 * Discover relationships across all entities in the wiki
 * POST /api/campaigns/{campaignId}/discover-relationships
 *
 * Body: { batchIndex?: number, batchSize?: number }
 * Returns: { suggestions: RelationshipSuggestion[], totalEntities, processedPairs, hasMore }
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

  // Rate limit check (discovery is expensive)
  const rateLimitResponse = withRateLimit(session.user.id, 'discovery', RATE_LIMITS.discovery)
  if (rateLimitResponse) return rateLimitResponse

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
    return new Response(JSON.stringify({ error: 'Only DMs can discover relationships' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const batchIndex = body.batchIndex || 0
    const batchSize = body.batchSize || 20 // Process 20 entities at a time

    // Get all entities
    const allEntities = await db.query.entities.findMany({
      where: eq(entities.campaignId, campaignId),
      columns: {
        id: true,
        name: true,
        entityType: true,
        content: true,
        aliases: true,
      },
      orderBy: (entities, { asc }) => [asc(entities.name)],
    })

    if (allEntities.length < 2) {
      return new Response(
        JSON.stringify({
          suggestions: [],
          totalEntities: allEntities.length,
          message: 'Need at least 2 entities to discover relationships'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get existing relationships to avoid duplicates
    const existingRelationships = await db.query.relationships.findMany({
      where: eq(relationships.campaignId, campaignId),
    })

    const existingPairs = new Set(
      existingRelationships.map(r => `${r.sourceEntityId}-${r.targetEntityId}-${r.relationshipType}`)
    )
    // Also check reverse direction for symmetric relationships
    existingRelationships.forEach(r => {
      existingPairs.add(`${r.targetEntityId}-${r.sourceEntityId}-${r.relationshipType}`)
    })

    // Get campaign settings
    const campaignSettings = getCampaignSettings((campaign as any).settings)
    const model: AIModel = campaignSettings.model.extractionModel || 'claude-3-5-haiku-20241022'
    const language = (campaign as any).language || 'en'

    // Calculate batch - we'll process a subset of entities as "focus" entities
    // and compare them against all others
    const startIdx = batchIndex * batchSize
    const focusEntities = allEntities.slice(startIdx, startIdx + batchSize)
    const hasMore = startIdx + batchSize < allEntities.length

    if (focusEntities.length === 0) {
      return new Response(
        JSON.stringify({
          suggestions: [],
          totalEntities: allEntities.length,
          processedPairs: 0,
          hasMore: false,
          complete: true
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build prompt with focus entities and all entities for context
    const systemPrompt = `You are analyzing RPG/D&D wiki content to discover relationships between entities.

Given a list of FOCUS entities and ALL entities in the wiki, identify relationships where FOCUS entities are the SOURCE.

RELATIONSHIP TYPES (use these exactly):
- lives_in / located_in: Physical location relationships
- member_of / part_of: Membership or belonging
- owns / owned_by: Ownership
- ally_of / enemy_of: Alliances and enmities
- knows / known_by: Acquaintance
- serves / served_by: Service relationships
- rules / ruled_by: Authority relationships
- parent_of / child_of / sibling_of: Family
- married_to: Marriage
- works_for / employs: Employment
- created / created_by: Creation
- killed / killed_by: Death
- worships / worshipped_by: Religious devotion
- guards / guarded_by: Protection
- seeks / sought_by: Pursuit
- fears / feared_by: Fear
- loves / loved_by / hates / hated_by: Strong emotions
- contains / contained_in: Containment
- visited / visited_by: Visitation
- related_to: General relationship

Return ONLY valid JSON array:
[
  {
    "sourceEntityId": "source-id",
    "targetEntityId": "target-id",
    "relationshipType": "relationship_type",
    "reverseLabel": "reverse_relationship_type",
    "reason": "Brief explanation"
  }
]

Rules:
- Only include relationships clearly implied or stated in content
- Be conservative - quality over quantity
- Don't create duplicate or redundant relationships
- Source must be from FOCUS entities, target can be any entity
${language !== 'en' ? `\nRespond with reasons in ${language}.` : ''}`

    // Build entity summaries
    const focusSummaries = focusEntities.map(e => {
      const contentPreview = (e.content || '').slice(0, 500)
      const aliases = (e.aliases || []).join(', ')
      return `[FOCUS] ${e.name} (${e.entityType}, id: ${e.id})${aliases ? `, aliases: ${aliases}` : ''}
${contentPreview}${(e.content || '').length > 500 ? '...' : ''}`
    }).join('\n\n')

    const otherEntities = allEntities.filter(e => !focusEntities.some(f => f.id === e.id))
    const otherSummaries = otherEntities.map(e => {
      const contentPreview = (e.content || '').slice(0, 200)
      return `- ${e.name} (${e.entityType}, id: ${e.id}): ${contentPreview}...`
    }).join('\n')

    const userPrompt = `FOCUS ENTITIES (find relationships FROM these):
${focusSummaries}

ALL OTHER ENTITIES (potential targets):
${otherSummaries}

Find relationships where FOCUS entities are the source. Return JSON array.`

    // Call AI
    const responseText = await generateSimple(model, systemPrompt, userPrompt, 4096)

    if (!responseText) {
      return new Response(
        JSON.stringify({
          suggestions: [],
          totalEntities: allEntities.length,
          batchIndex,
          hasMore
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse response
    let rawSuggestions: any[] = []
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        rawSuggestions = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('[Wiki-Discover] JSON parse error:', e)
    }

    // Validate and enrich suggestions
    const entityMap = new Map(allEntities.map(e => [e.id, e]))

    const suggestions: RelationshipSuggestion[] = rawSuggestions
      .filter(s => s.sourceEntityId && s.targetEntityId && s.relationshipType)
      .filter(s => {
        // Filter out already existing relationships
        const key = `${s.sourceEntityId}-${s.targetEntityId}-${s.relationshipType}`
        return !existingPairs.has(key)
      })
      .map(s => {
        const source = entityMap.get(s.sourceEntityId)
        const target = entityMap.get(s.targetEntityId)
        if (!source || !target) return null

        return {
          sourceEntityId: s.sourceEntityId,
          sourceEntityName: source.name,
          sourceEntityType: source.entityType,
          targetEntityId: s.targetEntityId,
          targetEntityName: target.name,
          targetEntityType: target.entityType,
          relationshipType: s.relationshipType,
          reverseLabel: s.reverseLabel || getDefaultReverseLabel(s.relationshipType),
          reason: s.reason || '',
        }
      })
      .filter((s): s is RelationshipSuggestion => s !== null)

    console.log(`[Wiki-Discover] Batch ${batchIndex}: Found ${suggestions.length} suggestions from ${focusEntities.length} focus entities`)

    return new Response(
      JSON.stringify({
        suggestions,
        totalEntities: allEntities.length,
        batchIndex,
        batchSize,
        processedEntities: Math.min(startIdx + batchSize, allEntities.length),
        hasMore,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Wiki-Discover] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Discovery failed' }),
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
