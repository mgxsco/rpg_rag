import { sql } from '@/lib/db'
import { generateEmbedding } from './embeddings'
import { SearchResult } from '@/lib/types'

export interface SearchOptions {
  limit?: number
  threshold?: number
  excludeDmOnly?: boolean
  includeNotes?: boolean // Include note embeddings in search
}

/**
 * Search for similar content using vector search on entity chunks and note embeddings
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
    includeNotes = true, // Include notes by default
  } = options

  try {
    // Generate embedding for query (use retrieval.query task for better matching)
    console.log('[RAG] Generating embedding for query...')
    const queryEmbedding = await generateEmbedding(query, 'retrieval.query')
    console.log('[RAG] Query embedding generated, dimensions:', queryEmbedding.length)

    const embeddingStr = `[${queryEmbedding.join(',')}]`
    const allResults: SearchResult[] = []

    // Search entity chunks
    console.log('[RAG] Running vector search on entity chunks with threshold:', threshold)
    const entityRows = await sql`
      SELECT
        e.id as entity_id,
        e.name as entity_name,
        e.entity_type,
        c.content as chunk_text,
        1 - (c.embedding <=> ${embeddingStr}::vector) as similarity,
        'entity' as source_type
      FROM chunks c
      JOIN entities e ON e.id = c.entity_id
      WHERE c.campaign_id = ${campaignId}
        AND c.embedding IS NOT NULL
        AND (${!excludeDmOnly} OR e.is_dm_only = false)
        AND 1 - (c.embedding <=> ${embeddingStr}::vector) > ${threshold}
      ORDER BY c.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `

    console.log('[RAG] Entity chunks found:', entityRows.length)

    for (const row of entityRows) {
      allResults.push({
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        entity_type: row.entity_type,
        chunk_text: row.chunk_text,
        similarity: row.similarity,
        source_type: 'entity',
        // Legacy aliases for backward compatibility
        note_id: row.entity_id,
        note_title: row.entity_name,
        note_type: row.entity_type,
      })
    }

    // Search note embeddings if enabled
    if (includeNotes) {
      console.log('[RAG] Running vector search on note embeddings...')
      const noteRows = await sql`
        SELECT
          n.id as note_id,
          n.title as note_title,
          n.note_type,
          ne.chunk_text,
          1 - (ne.embedding <=> ${embeddingStr}::vector) as similarity,
          'note' as source_type
        FROM note_embeddings ne
        JOIN notes n ON n.id = ne.note_id
        WHERE ne.campaign_id = ${campaignId}
          AND ne.embedding IS NOT NULL
          AND (${!excludeDmOnly} OR n.is_dm_only = false)
          AND 1 - (ne.embedding <=> ${embeddingStr}::vector) > ${threshold}
        ORDER BY ne.embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `

      console.log('[RAG] Note embeddings found:', noteRows.length)

      for (const row of noteRows) {
        allResults.push({
          entity_id: row.note_id,
          entity_name: row.note_title,
          entity_type: row.note_type,
          chunk_text: row.chunk_text,
          similarity: row.similarity,
          source_type: 'note',
          // Legacy aliases
          note_id: row.note_id,
          note_title: row.note_title,
          note_type: row.note_type,
        })
      }
    }

    // Sort combined results by similarity and limit
    allResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    const topResults = allResults.slice(0, limit)

    console.log('[RAG] Total search results:', topResults.length)
    if (topResults.length > 0) {
      console.log('[RAG] Top result:', {
        name: topResults[0].entity_name,
        type: topResults[0].entity_type,
        similarity: topResults[0].similarity,
        source: topResults[0].source_type,
        preview: topResults[0].chunk_text?.substring(0, 100)
      })
    }

    return topResults
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
