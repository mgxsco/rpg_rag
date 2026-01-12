import { sql } from '@vercel/postgres'
import { generateEmbedding } from './embeddings'
import { SearchResult } from '@/lib/types'

export interface SearchOptions {
  limit?: number
  threshold?: number
  excludeDmOnly?: boolean
}

/**
 * Search for similar content using vector search on entity chunks
 */
export async function searchSimilarChunks(
  campaignId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  console.log('[RAG] Starting search for campaign:', campaignId)
  console.log('[RAG] Query:', query)
  console.log('[RAG] JINA_API_KEY configured:', !!process.env.JINA_API_KEY)

  // Check if Jina API key is configured
  if (!process.env.JINA_API_KEY) {
    console.log('[RAG] Skipping vector search: JINA_API_KEY not configured')
    return []
  }

  const {
    limit = 8,
    threshold = 0.3, // Lowered threshold for better matching
    excludeDmOnly = false,
  } = options

  try {
    // First check if there are any chunks for this campaign
    const countResult = await sql`
      SELECT COUNT(*) as count FROM chunks WHERE campaign_id = ${campaignId}
    `
    console.log('[RAG] Total chunks in campaign:', countResult.rows[0]?.count)

    if (countResult.rows[0]?.count === '0' || countResult.rows[0]?.count === 0) {
      console.log('[RAG] No chunks found for this campaign. Upload documents to extract entities.')
      return []
    }

    // Generate embedding for query (use retrieval.query task for better matching)
    console.log('[RAG] Generating embedding for query...')
    const queryEmbedding = await generateEmbedding(query, 'retrieval.query')
    console.log('[RAG] Query embedding generated, dimensions:', queryEmbedding.length)

    const embeddingStr = `[${queryEmbedding.join(',')}]`

    // Vector similarity search on chunks table joined with entities
    console.log('[RAG] Running vector search with threshold:', threshold)
    const result = await sql`
      SELECT
        e.id as entity_id,
        e.name as entity_name,
        e.entity_type,
        c.content as chunk_text,
        1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
      FROM chunks c
      JOIN entities e ON e.id = c.entity_id
      WHERE c.campaign_id = ${campaignId}
        AND c.embedding IS NOT NULL
        AND (${!excludeDmOnly} OR e.is_dm_only = false)
        AND 1 - (c.embedding <=> ${embeddingStr}::vector) > ${threshold}
      ORDER BY c.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `

    console.log('[RAG] Search results found:', result.rows?.length || 0)
    if (result.rows && result.rows.length > 0) {
      console.log('[RAG] Top result:', {
        name: result.rows[0].entity_name,
        type: result.rows[0].entity_type,
        similarity: result.rows[0].similarity,
        preview: result.rows[0].chunk_text?.substring(0, 100)
      })
    }

    return (result.rows || []).map((row: any) => ({
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      entity_type: row.entity_type,
      chunk_text: row.chunk_text,
      similarity: row.similarity,
      // Legacy aliases for backward compatibility
      note_id: row.entity_id,
      note_title: row.entity_name,
      note_type: row.entity_type,
    }))
  } catch (error) {
    console.error('[RAG] Vector search error:', error)
    return []
  }
}

/**
 * Build context from search results for chat
 */
export function buildContext(results: SearchResult[]): string {
  console.log('[RAG] Building context from', results.length, 'results')

  if (results.length === 0) {
    return 'No relevant information found in the campaign knowledge base.'
  }

  const context = results
    .map((r, i) => {
      const name = r.entity_name || r.note_title || 'Unknown'
      const type = r.entity_type || r.note_type || 'unknown'
      return `[Source ${i + 1}: ${name} (${type})]\n${r.chunk_text}`
    })
    .join('\n\n---\n\n')

  console.log('[RAG] Context length:', context.length, 'characters')
  return context
}
