import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, ilike } from 'drizzle-orm'
import { runExtractionPipeline, ExtractionSettings, ExtractionProgress } from '@/lib/ai/extraction/pipeline'
import { getExistingEntityNames } from '@/lib/ai/extraction/dedup'
import { getCampaignSettings } from '@/lib/campaign-settings'
import { v4 as uuidv4 } from 'uuid'
import type { StagedEntity, StagedRelationship, EntityMatch, ExtractPreviewResponse } from '@/lib/types'

// Dynamic import for pdf-parse
async function parsePDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

/**
 * Extract entities with streaming progress updates
 * POST /api/campaigns/{campaignId}/documents/extract-stream
 *
 * Returns Server-Sent Events stream with progress, then final results
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
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const fileName = file.name
    const fileType = file.type
    const buffer = Buffer.from(await file.arrayBuffer())

    // Create a TransformStream for SSE
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    // Helper to send SSE event
    const sendEvent = async (event: string, data: any) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      await writer.write(encoder.encode(message))
    }

    // Start processing in the background
    ;(async () => {
      try {
        await sendEvent('progress', { stage: 'parsing', message: `Parsing ${fileName}...` })

        // Parse file content
        let content = ''
        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
          await sendEvent('progress', { stage: 'parsing', message: 'Extracting text from PDF...' })
          content = await parsePDF(buffer)
        } else if (
          fileType === 'text/plain' ||
          fileName.endsWith('.txt') ||
          fileName.endsWith('.md') ||
          fileType === 'text/markdown'
        ) {
          content = buffer.toString('utf-8')
        } else if (fileType === 'application/json' || fileName.endsWith('.json')) {
          const json = JSON.parse(buffer.toString('utf-8'))
          content = JSON.stringify(json, null, 2)
        } else {
          content = buffer.toString('utf-8')
        }

        content = content.trim()

        if (!content) {
          await sendEvent('error', { message: 'No content extracted from file' })
          await writer.close()
          return
        }

        await sendEvent('progress', {
          stage: 'parsed',
          message: `Parsed ${content.length.toLocaleString()} characters`,
          contentLength: content.length,
        })

        // Get language from campaign settings
        const language = (campaign as any).language || 'en'

        // Get existing entity names for deduplication
        await sendEvent('progress', { stage: 'loading', message: 'Loading existing entities...' })
        const existingNames = await getExistingEntityNames(params.campaignId)
        await sendEvent('progress', {
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

        await sendEvent('progress', {
          stage: 'starting',
          message: `Starting AI extraction (${extractionSettings.aggressiveness} mode)...`,
          mode: extractionSettings.aggressiveness,
        })

        // Run extraction pipeline with progress callback
        const extraction = await runExtractionPipeline(
          content,
          fileName,
          existingNames,
          language,
          async (progress: ExtractionProgress) => {
            await sendEvent('extraction', {
              stage: progress.stage,
              current: progress.current,
              total: progress.total,
              message: progress.message,
            })
          },
          extractionSettings
        )

        await sendEvent('progress', {
          stage: 'processing',
          message: `Processing ${extraction.entities.length} entities...`,
          entityCount: extraction.entities.length,
        })

        // Convert extracted entities to staged entities with tempIds
        const stagedEntities: StagedEntity[] = extraction.entities.map((entity) => ({
          tempId: uuidv4(),
          name: entity.name,
          canonicalName: entity.canonicalName,
          entityType: entity.type,
          content: entity.content,
          aliases: entity.aliases,
          tags: entity.tags,
          confidence: 0.8,
          excerpt: entity.content.slice(0, 300),
          status: 'pending' as const,
        }))

        // Send entity discovery events
        for (const entity of stagedEntities) {
          await sendEvent('entity', {
            name: entity.name,
            type: entity.entityType,
            aliasCount: entity.aliases.length,
          })
        }

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

        await sendEvent('progress', {
          stage: 'relationships',
          message: `Found ${stagedRelationships.length} relationships`,
          relationshipCount: stagedRelationships.length,
        })

        // Find existing entity matches for duplicates
        await sendEvent('progress', { stage: 'duplicates', message: 'Checking for duplicates...' })
        const existingEntityMatches: EntityMatch[] = []

        for (const staged of stagedEntities) {
          const exactMatch = await db.query.entities.findFirst({
            where: and(
              eq(entities.campaignId, params.campaignId),
              ilike(entities.canonicalName, staged.canonicalName)
            ),
            columns: {
              id: true,
              name: true,
              entityType: true,
              aliases: true,
              canonicalName: true,
            },
          })

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

          for (const alias of staged.aliases) {
            const aliasCanonical = alias
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')

            const aliasMatch = await db.query.entities.findFirst({
              where: and(
                eq(entities.campaignId, params.campaignId),
                ilike(entities.canonicalName, aliasCanonical)
              ),
              columns: {
                id: true,
                name: true,
                entityType: true,
                aliases: true,
                canonicalName: true,
              },
            })

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
          await sendEvent('progress', {
            stage: 'duplicates',
            message: `Found ${existingEntityMatches.length} potential duplicates`,
            duplicateCount: existingEntityMatches.length,
          })
        }

        // Send final result
        const response: ExtractPreviewResponse = {
          success: true,
          documentId: uuidv4(),
          fileName,
          extractedEntities: stagedEntities,
          extractedRelationships: stagedRelationships,
          existingEntityMatches,
        }

        await sendEvent('complete', response)
        await writer.close()
      } catch (error) {
        console.error('[Extract-Stream] Error:', error)
        await sendEvent('error', {
          message: error instanceof Error ? error.message : 'Extraction failed',
        })
        await writer.close()
      }
    })()

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Extract-Stream] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Extraction failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
