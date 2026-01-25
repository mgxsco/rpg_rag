import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, relationships } from '@/lib/db'
import { eq, and, ne } from 'drizzle-orm'
import { generateSimple } from '@/lib/ai/client'
import { getCampaignSettings } from '@/lib/campaign-settings'
import type { AIModel } from '@/lib/db/schema'

/**
 * Discover potential relationships for an entity using AI
 * POST /api/campaigns/{campaignId}/entities/{entityId}/discover-relationships
 *
 * Returns: { suggestions: Array<{ targetEntityId, targetEntityName, relationshipType, reverseLabel, reason }> }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string; entityId: string }> }
) {
  const { campaignId, entityId } = await params
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

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Get the source entity
    const sourceEntity = await db.query.entities.findFirst({
      where: and(
        eq(entities.campaignId, campaignId),
        eq(entities.id, entityId)
      ),
    })

    if (!sourceEntity) {
      return new Response(JSON.stringify({ error: 'Entity not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get existing relationships for this entity
    const existingRelationships = await db.query.relationships.findMany({
      where: eq(relationships.sourceEntityId, entityId),
    })
    const existingTargetIds = new Set(existingRelationships.map(r => r.targetEntityId))

    // Get other entities in the campaign (limit to avoid huge prompts)
    const otherEntities = await db.query.entities.findMany({
      where: and(
        eq(entities.campaignId, campaignId),
        ne(entities.id, entityId)
      ),
      columns: {
        id: true,
        name: true,
        entityType: true,
        content: true,
        aliases: true,
      },
      limit: 100, // Limit to prevent huge context
    })

    // Filter out entities we already have relationships with
    const candidateEntities = otherEntities.filter(e => !existingTargetIds.has(e.id))

    if (candidateEntities.length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [], message: 'No new entities to analyze' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get campaign settings
    const campaignSettings = getCampaignSettings((campaign as any).settings)
    const model: AIModel = campaignSettings.model.extractionModel || 'claude-3-5-haiku-20241022'
    const language = (campaign as any).language || 'en'

    // Build prompt
    const systemPrompt = `You are analyzing RPG/D&D wiki content to discover relationships between entities.

Given a SOURCE entity and a list of CANDIDATE entities, identify which candidates have a relationship with the source based on the content.

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
    "targetEntityId": "entity-id",
    "relationshipType": "relationship_type",
    "reverseLabel": "reverse_relationship_type",
    "reason": "Brief explanation of why this relationship exists"
  }
]

Only include relationships that are clearly implied or stated in the content. Be conservative - quality over quantity.
${language !== 'en' ? `\nRespond with reasons in ${language}.` : ''}`

    // Build entity summaries for context
    const candidateSummaries = candidateEntities.map(e => {
      const contentPreview = (e.content || '').slice(0, 300)
      return `- ${e.name} (${e.entityType}, id: ${e.id}): ${contentPreview}...`
    }).join('\n')

    const userPrompt = `SOURCE ENTITY:
Name: ${sourceEntity.name}
Type: ${sourceEntity.entityType}
Aliases: ${(sourceEntity.aliases || []).join(', ') || 'None'}
Content:
${sourceEntity.content || 'No content'}

CANDIDATE ENTITIES:
${candidateSummaries}

Find relationships between the SOURCE entity and the CANDIDATE entities. Return JSON array.`

    // Call AI
    const responseText = await generateSimple(model, systemPrompt, userPrompt, 4096)

    if (!responseText) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse response
    let suggestions: any[] = []
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('[Discover-Relationships] JSON parse error:', e)
    }

    // Validate and enrich suggestions
    const validSuggestions = suggestions
      .filter(s => s.targetEntityId && s.relationshipType)
      .map(s => {
        const targetEntity = candidateEntities.find(e => e.id === s.targetEntityId)
        return {
          targetEntityId: s.targetEntityId,
          targetEntityName: targetEntity?.name || 'Unknown',
          targetEntityType: targetEntity?.entityType || 'unknown',
          relationshipType: s.relationshipType,
          reverseLabel: s.reverseLabel || getDefaultReverseLabel(s.relationshipType),
          reason: s.reason || '',
        }
      })
      .filter(s => s.targetEntityName !== 'Unknown')

    console.log(`[Discover-Relationships] Found ${validSuggestions.length} suggestions for ${sourceEntity.name}`)

    return new Response(
      JSON.stringify({
        sourceEntity: {
          id: sourceEntity.id,
          name: sourceEntity.name,
          entityType: sourceEntity.entityType,
        },
        suggestions: validSuggestions,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Discover-Relationships] Error:', error)
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
