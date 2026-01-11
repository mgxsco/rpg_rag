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
  console.log('[RAG] Starting search for campaign:', campaignId)
  console.log('[RAG] Query:', query)
  console.log('[RAG] VOYAGE_API_KEY configured:', !!process.env.VOYAGE_API_KEY)

  // Check if Voyage API key is configured
  if (!process.env.VOYAGE_API_KEY) {
    console.log('[RAG] Skipping vector search: VOYAGE_API_KEY not configured')
    return []
  }

  const {
    limit = 8,
    threshold = 0.3, // Lowered threshold for better matching
    excludeDmOnly = false,
  } = options

  try {
    // First check if there are any embeddings for this campaign
    const countResult = await sql`
      SELECT COUNT(*) as count FROM note_embeddings WHERE campaign_id = ${campaignId}
    `
    console.log('[RAG] Total embeddings in campaign:', countResult.rows[0]?.count)

    if (countResult.rows[0]?.count === '0' || countResult.rows[0]?.count === 0) {
      console.log('[RAG] No embeddings found for this campaign. Run reindex first.')
      return []
    }

    // Generate embedding for query
    console.log('[RAG] Generating embedding for query...')
    const queryEmbedding = await generateEmbedding(query)
    console.log('[RAG] Query embedding generated, dimensions:', queryEmbedding.length)

    const embeddingStr = `[${queryEmbedding.join(',')}]`

    // Raw SQL query for vector similarity search
    console.log('[RAG] Running vector search with threshold:', threshold)
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

    console.log('[RAG] Search results found:', result.rows?.length || 0)
    if (result.rows && result.rows.length > 0) {
      console.log('[RAG] Top result:', {
        title: result.rows[0].note_title,
        similarity: result.rows[0].similarity,
        preview: result.rows[0].chunk_text?.substring(0, 100)
      })
    }

    return (result.rows || []).map((row: any) => ({
      note_id: row.note_id,
      note_title: row.note_title,
      note_slug: row.note_slug,
      note_type: row.note_type,
      chunk_text: row.chunk_text,
      similarity: row.similarity,
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
    return 'No relevant information found in the campaign notes.'
  }

  const context = results
    .map((r, i) => `[Source ${i + 1}: ${r.note_title} (${r.note_type})]\n${r.chunk_text}`)
    .join('\n\n---\n\n')

  console.log('[RAG] Context length:', context.length, 'characters')
  return context
}
