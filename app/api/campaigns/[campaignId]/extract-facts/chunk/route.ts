import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, entityFacts, factMentions } from '@/lib/db'
import { eq, and, inArray } from 'drizzle-orm'
import { extractFactsFromChunk, groupFactsBySubject, deduplicateFacts, ExtractedFact } from '@/lib/ai/extraction/facts'
import { AIModel } from '@/lib/db/schema'
import { v4 as uuidv4 } from 'uuid'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const maxDuration = 60

/**
 * Extract facts from a single chunk and optionally store them
 * POST /api/campaigns/{campaignId}/extract-facts/chunk
 *
 * Body: {
 *   chunkContent: string,
 *   chunkIndex: number,
 *   totalChunks: number,
 *   language?: string,
 *   existingEntityNames?: string[],
 *   extractionModel?: AIModel,
 *   storeImmediately?: boolean,  // If true, store facts in DB right away
 *   sourceDocumentId?: string,   // Optional document source
 *   sourceSessionId?: string,    // Optional session source
 * }
 *
 * Returns: {
 *   facts: ExtractedFact[],
 *   newEntities: { name, type, canonicalName }[],
 *   storedFactIds?: string[],
 *   chunkIndex: number
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
      chunkContent,
      chunkIndex = 0,
      totalChunks = 1,
      language = 'en',
      existingEntityNames = [],
      extractionModel = 'claude-3-5-haiku-20241022' as AIModel,
      storeImmediately = false,
      sourceDocumentId,
      sourceSessionId,
    } = body

    if (!chunkContent || typeof chunkContent !== 'string') {
      return new Response(JSON.stringify({ error: 'Chunk content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[Extract-Facts] Processing chunk ${chunkIndex + 1}/${totalChunks} (${chunkContent.length} chars)`)

    // Extract facts from the chunk
    const extractedFacts = await extractFactsFromChunk(
      chunkContent,
      existingEntityNames,
      extractionModel,
      language
    )

    console.log(`[Extract-Facts] Chunk ${chunkIndex + 1}: Extracted ${extractedFacts.length} facts`)

    // Group by subject and identify new entities
    const existingSet = new Set<string>(
      (existingEntityNames as string[]).map((n: string) =>
        n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      )
    )
    const { bySubject, newSubjects } = groupFactsBySubject(extractedFacts, existingSet)

    let storedFactIds: string[] = []

    // If storeImmediately is true, create entities and store facts now
    if (storeImmediately && extractedFacts.length > 0) {
      storedFactIds = await storeFacts(
        campaignId,
        extractedFacts,
        newSubjects,
        session.user.id,
        sourceDocumentId,
        sourceSessionId
      )
    }

    return new Response(
      JSON.stringify({
        facts: extractedFacts,
        newEntities: newSubjects,
        storedFactIds,
        chunkIndex,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Extract-Facts] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Extraction failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Store extracted facts in the database
 */
async function storeFacts(
  campaignId: string,
  facts: ExtractedFact[],
  newSubjects: Array<{ name: string; type: string; canonicalName: string }>,
  userId: string,
  sourceDocumentId?: string,
  sourceSessionId?: string
): Promise<string[]> {
  const storedFactIds: string[] = []

  // First, create any new entities
  const entityNameToId = new Map<string, string>()

  // Get existing entities for this campaign
  const existingEntities = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    columns: { id: true, name: true, canonicalName: true },
  })

  for (const existing of existingEntities) {
    entityNameToId.set(existing.canonicalName, existing.id)
    entityNameToId.set(existing.name.toLowerCase(), existing.id)
  }

  // Create new entities
  for (const subject of newSubjects) {
    if (!entityNameToId.has(subject.canonicalName)) {
      const entityId = uuidv4()
      await db.insert(entities).values({
        id: entityId,
        campaignId,
        name: subject.name,
        canonicalName: subject.canonicalName,
        entityType: subject.type,
        content: `A ${subject.type} in the campaign.`,
        aliases: [],
        tags: [subject.type],
      })
      entityNameToId.set(subject.canonicalName, entityId)
      entityNameToId.set(subject.name.toLowerCase(), entityId)
    }
  }

  // Now store facts for each entity
  for (const fact of facts) {
    const subjectCanonical = fact.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const entityId = entityNameToId.get(subjectCanonical) || entityNameToId.get(fact.subject.toLowerCase())

    if (!entityId) {
      console.warn(`[Store-Facts] Could not find entity for subject: ${fact.subject}`)
      continue
    }

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
      createdBy: userId,
    })

    storedFactIds.push(factId)

    // Store fact mentions (relationships to other entities)
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

  return storedFactIds
}
