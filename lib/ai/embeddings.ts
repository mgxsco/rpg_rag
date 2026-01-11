import OpenAI from 'openai'
import { db, noteEmbeddings } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { chunkContent } from './chunker'

// Lazy-initialize OpenAI client to avoid build errors
let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

/**
 * Generate embedding for a text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
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
