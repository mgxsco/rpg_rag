import { db, chunks } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { generateEmbedding } from './embeddings'
import { chunkContent } from './chunker'

/**
 * Sync embeddings for an entity
 * - Chunks the entity content
 * - Generates embeddings for each chunk
 * - Stores in the chunks table for RAG
 */
export async function syncEntityEmbeddings(
  entityId: string,
  campaignId: string,
  name: string,
  content: string
): Promise<void> {
  console.log('[EntityEmbeddings] Syncing embeddings for entity:', name)

  // Check if Jina API key is configured
  if (!process.env.JINA_API_KEY) {
    console.log('[EntityEmbeddings] Skipping: JINA_API_KEY not configured')
    return
  }

  // Delete old chunks for this entity
  console.log('[EntityEmbeddings] Deleting old chunks for entity:', entityId)
  await db.delete(chunks).where(eq(chunks.entityId, entityId))

  // Skip if content is empty
  if (!content.trim()) {
    console.log('[EntityEmbeddings] Skipping: content is empty')
    return
  }

  // Chunk the content
  const contentChunks = chunkContent(content, name)
  console.log('[EntityEmbeddings] Created', contentChunks.length, 'chunks from content')

  // Generate embeddings and store
  let successCount = 0
  for (const chunk of contentChunks) {
    try {
      console.log('[EntityEmbeddings] Processing chunk', chunk.index, '- length:', chunk.text.length)
      const embedding = await generateEmbedding(chunk.text)

      // Extract entity mentions from the chunk (wikilinks)
      const entityMentions = extractEntityMentions(chunk.text)

      await db.insert(chunks).values({
        entityId,
        campaignId,
        content: chunk.text,
        chunkIndex: chunk.index,
        headerPath: chunk.metadata?.headers || [],
        entityMentions,
        embedding,
      })
      successCount++
      console.log('[EntityEmbeddings] Stored chunk', chunk.index, 'successfully')
    } catch (error) {
      console.error(`[EntityEmbeddings] Failed to embed chunk ${chunk.index}:`, error)
    }
  }

  console.log('[EntityEmbeddings] Completed:', successCount, 'of', contentChunks.length, 'chunks stored')
}

/**
 * Extract entity mentions from text (wikilinks like [[Entity Name]])
 */
function extractEntityMentions(text: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g
  const mentions: string[] = []
  let match

  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1].trim())
  }

  return [...new Set(mentions)] // Deduplicate
}

/**
 * Delete all chunks for an entity
 */
export async function deleteEntityChunks(entityId: string): Promise<void> {
  await db.delete(chunks).where(eq(chunks.entityId, entityId))
}

/**
 * Update embeddings for an entity (after content edit)
 * Preserves the entity but regenerates all chunks
 */
export async function updateEntityEmbeddings(
  entityId: string,
  campaignId: string,
  name: string,
  content: string
): Promise<void> {
  // Just re-sync - it handles deletion and recreation
  await syncEntityEmbeddings(entityId, campaignId, name, content)
}
