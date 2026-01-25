import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, entityFacts, factMentions } from '@/lib/db'
import { eq, and, inArray } from 'drizzle-orm'
import { updateEntitySummary } from '@/lib/ai/extraction/summary'
import type { ExtractedFact } from '@/lib/ai/extraction/facts'
import type { AIModel } from '@/lib/db/schema'
import { v4 as uuidv4 } from 'uuid'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const maxDuration = 120 // Longer timeout for summary generation

/**
 * Commit reviewed facts and regenerate entity summaries
 * POST /api/campaigns/{campaignId}/extract-facts/commit
 *
 * Body: {
 *   facts: ExtractedFact[],         // Facts to store (user-reviewed)
 *   newEntities: { name, type, canonicalName }[],  // New entities to create
 *   sourceDocumentId?: string,
 *   sourceSessionId?: string,
 *   regenerateSummaries?: boolean,  // Whether to regenerate wiki summaries (default: true)
 *   summaryModel?: AIModel,         // Model to use for summary generation
 * }
 *
 * Returns: {
 *   storedFactIds: string[],
 *   createdEntityIds: string[],
 *   updatedEntityIds: string[],    // Entities whose summaries were regenerated
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

  // Rate limit check
  const rateLimitResponse = withRateLimit(session.user.id, 'extraction', RATE_LIMITS.extraction)
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

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json()
    const {
      facts = [],
      newEntities = [],
      sourceDocumentId,
      sourceSessionId,
      regenerateSummaries = true,
      summaryModel = 'claude-3-5-haiku-20241022' as AIModel,
    } = body

    console.log(`[Commit-Facts] Committing ${facts.length} facts, ${newEntities.length} new entities`)

    // Build entity name -> id map
    const entityNameToId = new Map<string, string>()
    const createdEntityIds: string[] = []

    // Get existing entities
    const existingEntities = await db.query.entities.findMany({
      where: eq(entities.campaignId, campaignId),
      columns: { id: true, name: true, canonicalName: true },
    })

    for (const existing of existingEntities) {
      entityNameToId.set(existing.canonicalName, existing.id)
      entityNameToId.set(existing.name.toLowerCase(), existing.id)
    }

    // Create new entities
    for (const newEntity of newEntities) {
      if (!entityNameToId.has(newEntity.canonicalName)) {
        const entityId = uuidv4()
        await db.insert(entities).values({
          id: entityId,
          campaignId,
          name: newEntity.name,
          canonicalName: newEntity.canonicalName,
          entityType: newEntity.type,
          content: `A ${newEntity.type} in the campaign.`,
          aliases: [],
          tags: [newEntity.type],
        })
        entityNameToId.set(newEntity.canonicalName, entityId)
        entityNameToId.set(newEntity.name.toLowerCase(), entityId)
        createdEntityIds.push(entityId)
        console.log(`[Commit-Facts] Created entity: ${newEntity.name} (${entityId})`)
      }
    }

    // Store facts
    const storedFactIds: string[] = []
    const affectedEntityIds = new Set<string>()

    for (const fact of facts as ExtractedFact[]) {
      const subjectCanonical = fact.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const entityId = entityNameToId.get(subjectCanonical) || entityNameToId.get(fact.subject.toLowerCase())

      if (!entityId) {
        console.warn(`[Commit-Facts] Could not find entity for subject: ${fact.subject}`)
        continue
      }

      affectedEntityIds.add(entityId)

      const factId = uuidv4()
      await db.insert(entityFacts).values({
        id: factId,
        campaignId,
        entityId,
        content: fact.fact,
        section: fact.section,
        sourceDocumentId: sourceDocumentId || null,
        sourceSessionId: sourceSessionId || null,
        sourceExcerpt: fact.sourceExcerpt || null,
        confidence: String(fact.confidence),
        isDmOnly: fact.isDmOnly,
        createdBy: session.user.id,
      })

      storedFactIds.push(factId)

      // Store fact mentions
      for (const mention of fact.mentions) {
        const mentionCanonical = mention.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const mentionedEntityId = entityNameToId.get(mentionCanonical) || entityNameToId.get(mention.name.toLowerCase())

        if (mentionedEntityId && mentionedEntityId !== entityId) {
          await db.insert(factMentions).values({
            id: uuidv4(),
            factId,
            mentionedEntityId,
            relationshipType: mention.relationship || null,
          })
        }
      }
    }

    console.log(`[Commit-Facts] Stored ${storedFactIds.length} facts, affecting ${affectedEntityIds.size} entities`)

    // Regenerate summaries for affected entities
    const updatedEntityIds: string[] = []

    if (regenerateSummaries && affectedEntityIds.size > 0) {
      console.log(`[Commit-Facts] Regenerating summaries for ${affectedEntityIds.size} entities...`)

      for (const entityId of affectedEntityIds) {
        try {
          await updateEntitySummary(entityId, summaryModel)
          updatedEntityIds.push(entityId)
        } catch (error) {
          console.error(`[Commit-Facts] Failed to regenerate summary for entity ${entityId}:`, error)
        }
      }

      console.log(`[Commit-Facts] Regenerated ${updatedEntityIds.length} summaries`)
    }

    return new Response(
      JSON.stringify({
        storedFactIds,
        createdEntityIds,
        updatedEntityIds,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Commit-Facts] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Commit failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
