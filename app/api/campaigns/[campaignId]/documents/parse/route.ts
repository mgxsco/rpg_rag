import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

// Dynamic import for pdf-parse
async function parsePDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

/**
 * Parse a document and return chunks for client-side extraction
 * POST /api/campaigns/{campaignId}/documents/parse
 *
 * This is a fast endpoint that just parses and chunks - no AI calls.
 * The client then sends each chunk to /extract-facts/chunk or /extract-step/chunk
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

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const chunkSize = parseInt(formData.get('chunkSize') as string) || 3000

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const fileName = file.name
    const fileType = file.type
    const buffer = Buffer.from(await file.arrayBuffer())

    // Parse file content
    let content = ''
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
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
      return new Response(JSON.stringify({ error: 'No content extracted from file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Chunk the document
    const chunks = chunkDocument(content, chunkSize)

    // Get existing entity names for deduplication
    const existingEntities = await db.query.entities.findMany({
      where: eq(entities.campaignId, campaignId),
      columns: { name: true, canonicalName: true },
    })

    const existingEntityNames = existingEntities.map(e => e.name)

    // Get campaign settings
    const language = (campaign as any).language || 'en'

    return new Response(
      JSON.stringify({
        fileName,
        contentLength: content.length,
        chunks,
        totalChunks: chunks.length,
        existingEntityNames,
        language,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Parse] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Parse failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Chunk document into smaller pieces by paragraphs
 */
function chunkDocument(content: string, maxChunkSize: number = 3000): string[] {
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
