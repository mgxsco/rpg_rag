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
    throw new Error(`Voyage AI error: ${error}`)
  }

  const data = await response.json()
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
  // Check if Voyage API key is configured
  if (!process.env.VOYAGE_API_KEY) {
    console.log('Skipping embeddings: VOYAGE_API_KEY not configured')
    return
  }

  // Delete old embeddings
  await db.delete(noteEmbeddings).where(eq(noteEmbeddings.noteId, noteId))

  // Skip if content is empty
  if (!content.trim()) {
    return
  }

  // Chunk the content
  const chunks = chunkContent(content, title)

  // Generate embeddings and store
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.text)

      await db.insert(noteEmbeddings).values({
        noteId,
        campaignId,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        embedding,
      })
    } catch (error) {
      console.error(`Failed to embed chunk ${chunk.index}:`, error)
    }
  }
}

/**
 * Delete all embeddings for a note
 */
export async function deleteNoteEmbeddings(noteId: string): Promise<void> {
  await db.delete(noteEmbeddings).where(eq(noteEmbeddings.noteId, noteId))
}
