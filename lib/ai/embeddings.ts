import { db, noteEmbeddings } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { chunkContent } from './chunker'

/**
 * Generate embedding using Voyage AI (Anthropic's recommended embedding partner)
 * Uses voyage-2 model which produces 1024-dimensional embeddings
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY

  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not configured')
  }

  console.log('[Embeddings] Generating embedding for text of length:', text.length)

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'voyage-2',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[Embeddings] Voyage AI error:', error)
    throw new Error(`Voyage AI error: ${error}`)
  }

  const data = await response.json()
  console.log('[Embeddings] Generated embedding with', data.data[0].embedding.length, 'dimensions')
  return data.data[0].embedding
}

/**
 * Sync embeddings for a note
 * - Chunks the content
 * - Generates embeddings for each chunk
 * - Stores in database
 */
export async function syncNoteEmbeddings(
  noteId: string,
  campaignId: string,
  title: string,
  content: string
): Promise<void> {
  console.log('[Embeddings] Syncing embeddings for note:', title)
  console.log('[Embeddings] VOYAGE_API_KEY configured:', !!process.env.VOYAGE_API_KEY)

  // Check if Voyage API key is configured
  if (!process.env.VOYAGE_API_KEY) {
    console.log('[Embeddings] Skipping: VOYAGE_API_KEY not configured')
    return
  }

  // Delete old embeddings
  console.log('[Embeddings] Deleting old embeddings for note:', noteId)
  await db.delete(noteEmbeddings).where(eq(noteEmbeddings.noteId, noteId))

  // Skip if content is empty
  if (!content.trim()) {
    console.log('[Embeddings] Skipping: content is empty')
    return
  }

  // Chunk the content
  const chunks = chunkContent(content, title)
  console.log('[Embeddings] Created', chunks.length, 'chunks from content')

  // Generate embeddings and store
  let successCount = 0
  for (const chunk of chunks) {
    try {
      console.log('[Embeddings] Processing chunk', chunk.index, '- length:', chunk.text.length)
      const embedding = await generateEmbedding(chunk.text)

      await db.insert(noteEmbeddings).values({
        noteId,
        campaignId,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        embedding,
      })
      successCount++
      console.log('[Embeddings] Stored chunk', chunk.index, 'successfully')
    } catch (error) {
      console.error(`[Embeddings] Failed to embed chunk ${chunk.index}:`, error)
    }
  }

  console.log('[Embeddings] Completed:', successCount, 'of', chunks.length, 'chunks stored')
}

/**
 * Delete all embeddings for a note
 */
export async function deleteNoteEmbeddings(noteId: string): Promise<void> {
  await db.delete(noteEmbeddings).where(eq(noteEmbeddings.noteId, noteId))
}
