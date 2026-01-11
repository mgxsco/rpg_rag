import OpenAI from 'openai'
import { createServiceClient } from '@/lib/supabase/server'
import { chunkContent } from './chunker'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Generate embedding for a text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
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
  const supabase = createServiceClient()

  // Delete old embeddings
  await supabase
    .from('note_embeddings')
    .delete()
    .eq('note_id', noteId)

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

      await supabase.from('note_embeddings').insert({
        note_id: noteId,
        campaign_id: campaignId,
        chunk_index: chunk.index,
        chunk_text: chunk.text,
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
  const supabase = createServiceClient()
  await supabase
    .from('note_embeddings')
    .delete()
    .eq('note_id', noteId)
}
