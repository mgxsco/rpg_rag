import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { getExistingEntityNames } from '@/lib/ai/extraction/dedup'
import { getCampaignSettings } from '@/lib/campaign-settings'

/**
 * Initialize stepped extraction
 * POST /api/campaigns/{campaignId}/extract-step/init
 *
 * Body: { content: string, title: string, sourceType: 'note' | 'entity' | 'document', sourceId?: string }
 * Returns: { sessionId, chunks, settings, existingEntityNames }
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
    const { content, title, sourceType, sourceId } = body

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const trimmedContent = content.trim()
    if (trimmedContent.length === 0) {
      return new Response(JSON.stringify({ error: 'Content is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get campaign settings
    const campaignSettings = getCampaignSettings((campaign as any).settings)
    const chunkSize = campaignSettings.extraction.chunkSize
    const language = (campaign as any).language || 'pt-BR'

    // Chunk the content
    const chunks = chunkContent(trimmedContent, chunkSize)

    // Get existing entity names for deduplication
    const existingEntityNames = await getExistingEntityNames(params.campaignId)

    // If extracting from an entity, exclude its own name
    if (sourceType === 'entity' && sourceId) {
      // We'll add the source entity name later when processing
    }

    // Generate session ID
    const sessionId = crypto.randomUUID()

    return new Response(
      JSON.stringify({
        sessionId,
        title: title || 'Untitled',
        sourceType: sourceType || 'document',
        sourceId,
        language,
        totalChunks: chunks.length,
        chunks: chunks.map((chunk, index) => ({
          index,
          length: chunk.length,
          preview: chunk.slice(0, 100) + (chunk.length > 100 ? '...' : ''),
          content: chunk, // Full content for client to send back
        })),
        settings: {
          chunkSize: campaignSettings.extraction.chunkSize,
          aggressiveness: campaignSettings.extraction.aggressiveness,
          confidenceThreshold: campaignSettings.extraction.confidenceThreshold,
          enableRelationships: campaignSettings.extraction.enableRelationships,
          extractionModel: campaignSettings.model.extractionModel,
        },
        existingEntityNames,
        contentLength: trimmedContent.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Extract-Init] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Initialization failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Chunk content into smaller pieces for extraction
 */
function chunkContent(content: string, maxChunkSize: number = 2000): string[] {
  const chunks: string[] = []

  // Try to split on paragraph breaks
  const paragraphs = content.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = para
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  // If we still have chunks that are too large, split them further
  const finalChunks: string[] = []
  for (const chunk of chunks) {
    if (chunk.length > maxChunkSize) {
      // Split by sentences
      const sentences = chunk.split(/(?<=[.!?])\s+/)
      let subChunk = ''
      for (const sentence of sentences) {
        if (subChunk.length + sentence.length > maxChunkSize && subChunk.length > 0) {
          finalChunks.push(subChunk.trim())
          subChunk = sentence
        } else {
          subChunk += (subChunk ? ' ' : '') + sentence
        }
      }
      if (subChunk.trim()) {
        finalChunks.push(subChunk.trim())
      }
    } else {
      finalChunks.push(chunk)
    }
  }

  return finalChunks.length > 0 ? finalChunks : [content.slice(0, maxChunkSize)]
}
