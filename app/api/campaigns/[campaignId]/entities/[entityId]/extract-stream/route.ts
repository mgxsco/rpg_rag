import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { runExtractionPipeline, ExtractionSettings, ExtractionProgress } from '@/lib/ai/extraction/pipeline'
import { getExistingEntityNames } from '@/lib/ai/extraction/dedup'
import { getCampaignSettings } from '@/lib/campaign-settings'
import { v4 as uuidv4 } from 'uuid'
import type { StagedEntity, StagedRelationship, EntityMatch, ExtractPreviewResponse } from '@/lib/types'

/**
 * Extract entities from an entity (e.g., session) with streaming progress updates
 * POST /api/campaigns/{campaignId}/entities/{entityId}/extract-stream
 *
 * Returns Server-Sent Events stream with progress, then final staged results for review
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string; entityId: string } }
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

  // Get the entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.campaignId, params.campaignId),
      eq(entities.id, params.entityId)
    ),
  })

  if (!entity) {
    return new Response(JSON.stringify({ error: 'Entity not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!entity.content || entity.content.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Entity has no content to extract' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Use ReadableStream with start() to keep the stream alive
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE event
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      try {
        sendEvent('progress', { stage: 'starting', message: `Analyzing: ${entity.name}...` })

        const content = (entity.content || '').trim()

        sendEvent('progress', {
          stage: 'parsed',
          message: `Content: ${content.length.toLocaleString()} characters`,
          contentLength: content.length,
        })

        // Get language from campaign settings
        const language = (campaign as any).language || 'pt-BR'

        // Get existing entity names for deduplication (exclude the source entity)
        sendEvent('progress', { stage: 'loading', message: 'Loading existing entities...' })
        const existingNames = await getExistingEntityNames(params.campaignId)
        // Add the source entity name to avoid extracting it
        existingNames.push(entity.name)
        if (entity.aliases) {
          existingNames.push(...entity.aliases)
        }

        sendEvent('progress', {
          stage: 'loaded',
          message: `Found ${existingNames.length} existing entities`,
          existingCount: existingNames.length,
        })

        // Get campaign settings for extraction
        const campaignSettings = getCampaignSettings((campaign as any).settings)
        const extractionSettings: ExtractionSettings = {
          chunkSize: campaignSettings.extraction.chunkSize,
          aggressiveness: campaignSettings.extraction.aggressiveness,
          confidenceThreshold: campaignSettings.extraction.confidenceThreshold,
          enableRelationships: campaignSettings.extraction.enableRelationships,
          customPrompts: {
            extractionConservativePrompt: campaignSettings.prompts.extractionConservativePrompt,
            extractionBalancedPrompt: campaignSettings.prompts.extractionBalancedPrompt,
            extractionObsessivePrompt: campaignSettings.prompts.extractionObsessivePrompt,
          },
        }

        sendEvent('progress', {
          stage: 'starting',
          message: `Starting AI extraction (${extractionSettings.aggressiveness} mode)...`,
          mode: extractionSettings.aggressiveness,
        })

        // Run extraction pipeline with progress callback and timeout
        const extractionPromise = runExtractionPipeline(
          content,
          entity.name,
          existingNames,
          language,
          (progress: ExtractionProgress) => {
            sendEvent('extraction', {
              stage: progress.stage,
              current: progress.current,
              total: progress.total,
              message: progress.message,
            })
          },
          {
            ...extractionSettings,
            maxChunks: 6, // Reduced for Vercel timeout
            parallelBatchSize: 1, // Sequential for stability
          }
        )

        // Timeout after 45 seconds (Vercel Pro has 60s limit, leave margin)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Extraction timed out - content may be too large')), 45000)
        )

        const extraction = await Promise.race([extractionPromise, timeoutPromise])

        sendEvent('progress', {
          stage: 'processing',
          message: `Processing ${extraction.entities.length} entities...`,
          entityCount: extraction.entities.length,
        })

        // Convert extracted entities to staged entities with tempIds
        const stagedEntities: StagedEntity[] = extraction.entities.map((e) => ({
          tempId: uuidv4(),
          name: e.name,
          canonicalName: e.canonicalName,
          entityType: e.type,
          content: e.content,
          aliases: e.aliases,
          tags: e.tags,
          confidence: 0.8,
          excerpt: e.content.slice(0, 300),
          status: 'pending' as const,
        }))

        // Send entity discovery events (batch to reduce overhead)
        sendEvent('progress', {
          stage: 'entities',
          message: `Found ${stagedEntities.length} entities`,
          entityCount: stagedEntities.length,
        })

        // Create tempId lookup for relationships
        const nameToTempId = new Map<string, string>()
        stagedEntities.forEach((e) => {
          nameToTempId.set(e.name.toLowerCase(), e.tempId)
          e.aliases.forEach((alias) => nameToTempId.set(alias.toLowerCase(), e.tempId))
        })

        // Convert relationships to staged relationships
        const stagedRelationships: StagedRelationship[] = []
        for (const rel of extraction.relationships) {
          const sourceTempId = nameToTempId.get(rel.sourceEntity.toLowerCase())
          const targetTempId = nameToTempId.get(rel.targetEntity.toLowerCase())

          if (!sourceTempId || !targetTempId) {
            continue
          }

          stagedRelationships.push({
            tempId: uuidv4(),
            sourceEntityTempId: sourceTempId,
            targetEntityTempId: targetTempId,
            sourceEntityName: rel.sourceEntity,
            targetEntityName: rel.targetEntity,
            relationshipType: rel.relationshipType,
            reverseLabel: rel.reverseLabel,
            excerpt: rel.excerpt || '',
            status: 'pending' as const,
          })
        }

        sendEvent('progress', {
          stage: 'relationships',
          message: `Found ${stagedRelationships.length} relationships`,
          relationshipCount: stagedRelationships.length,
        })

        // Find existing entity matches for duplicates - batch query for efficiency
        sendEvent('progress', { stage: 'duplicates', message: 'Checking for duplicates...' })
        const existingEntityMatches: EntityMatch[] = []

        // Get all existing entities in one query
        const existingEntities = await db.query.entities.findMany({
          where: eq(entities.campaignId, params.campaignId),
          columns: {
            id: true,
            name: true,
            entityType: true,
            aliases: true,
            canonicalName: true,
          },
        })

        // Build lookup map for fast matching
        const canonicalMap = new Map<string, (typeof existingEntities)[0]>()
        for (const ent of existingEntities) {
          canonicalMap.set(ent.canonicalName.toLowerCase(), ent)
        }

        // Check each staged entity against the map
        for (const staged of stagedEntities) {
          const exactMatch = canonicalMap.get(staged.canonicalName.toLowerCase())
          if (exactMatch) {
            existingEntityMatches.push({
              stagedTempId: staged.tempId,
              existingEntity: {
                id: exactMatch.id,
                name: exactMatch.name,
                entityType: exactMatch.entityType,
                aliases: exactMatch.aliases || [],
                canonicalName: exactMatch.canonicalName,
              },
              matchType: 'exact',
              confidence: 1.0,
            })
            continue
          }

          // Check aliases
          for (const alias of staged.aliases) {
            const aliasCanonical = alias
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')

            const aliasMatch = canonicalMap.get(aliasCanonical)
            if (aliasMatch) {
              existingEntityMatches.push({
                stagedTempId: staged.tempId,
                existingEntity: {
                  id: aliasMatch.id,
                  name: aliasMatch.name,
                  entityType: aliasMatch.entityType,
                  aliases: aliasMatch.aliases || [],
                  canonicalName: aliasMatch.canonicalName,
                },
                matchType: 'alias',
                confidence: 0.8,
              })
              break
            }
          }
        }

        if (existingEntityMatches.length > 0) {
          sendEvent('progress', {
            stage: 'duplicates',
            message: `Found ${existingEntityMatches.length} potential duplicates`,
            duplicateCount: existingEntityMatches.length,
          })
        }

        // Send final result with entity metadata
        const response: ExtractPreviewResponse & { sourceEntityId: string; sourceEntityName: string } = {
          success: true,
          documentId: uuidv4(), // Will be created when committed
          fileName: `Entity: ${entity.name}`,
          sourceEntityId: entity.id,
          sourceEntityName: entity.name,
          extractedEntities: stagedEntities,
          extractedRelationships: stagedRelationships,
          existingEntityMatches,
        }

        sendEvent('complete', response)
        controller.close()
      } catch (error) {
        console.error('[Entity-Extract-Stream] Error:', error)
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        }
        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Extraction failed',
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
