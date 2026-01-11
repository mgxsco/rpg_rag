import { sql } from '@vercel/postgres'
import { generateEmbedding } from './embeddings'
import { SearchResult } from '@/lib/types'

export interface SearchOptions {
  limit?: number
  threshold?: number
  excludeDmOnly?: boolean
}

/**
 * Search for similar content using vector search
 */
export async function searchSimilarChunks(
  campaignId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    limit = 8,
    threshold = 0.5,
    excludeDmOnly = false,
  } = options

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query)
  const embeddingStr = `[${queryEmbedding.join(',')}]`

  // Raw SQL query for vector similarity search
  const result = await sql`
    SELECT
      n.id as note_id,
      n.title as note_title,
      n.slug as note_slug,
      n.note_type,
      e.chunk_text,
      1 - (e.embedding <=> ${embeddingStr}::vector) as similarity
    FROM note_embeddings e
    JOIN notes n ON n.id = e.note_id
    WHERE e.campaign_id = ${campaignId}
      AND (${!excludeDmOnly} OR n.is_dm_only = false)
      AND 1 - (e.embedding <=> ${embeddingStr}::vector) > ${threshold}
    ORDER BY e.embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `

  return (result.rows || []).map((row: any) => ({
    note_id: row.note_id,
    note_title: row.note_title,
    note_slug: row.note_slug,
    note_type: row.note_type,
    chunk_text: row.chunk_text,
    similarity: row.similarity,
  }))
}

/**
 * Build context from search results for chat
 */
export function buildContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant information found in the campaign notes.'
  }

  return results
    .map((r, i) => `[Source ${i + 1}: ${r.note_title} (${r.note_type})]\n${r.chunk_text}`)
    .join('\n\n---\n\n')
}
