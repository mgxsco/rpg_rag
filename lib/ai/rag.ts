import { sql } from '@/lib/db'
import { generateEmbedding } from './embeddings'
import { SearchResult } from '@/lib/types'

export interface SearchOptions {
  limit?: number
  threshold?: number
  excludeDmOnly?: boolean
  includeNotes?: boolean // Include note embeddings in search
  enableKeywordFallback?: boolean // Fall back to keyword search if vector search has few results
}

/**
 * Search for similar content using vector search on entity chunks and note embeddings
 */
export async function searchSimilarChunks(
  campaignId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    limit = 8,
    threshold = 0.2, // Low threshold - rely on keyword fallback for exact matches
    excludeDmOnly = false,
    includeNotes = true, // Include notes by default
    enableKeywordFallback = true, // Enable keyword search fallback by default
  } = options

  // Sanitize query - remove null bytes and control characters
  const sanitizedQuery = query.replace(/\x00/g, '').replace(/[\x00-\x1F\x7F]/g, ' ').trim()

  console.log('[RAG] Starting search for campaign:', campaignId)
  console.log('[RAG] Query:', sanitizedQuery)
  console.log('[RAG] JINA_API_KEY configured:', !!process.env.JINA_API_KEY)

  // Check if Jina API key is configured
  if (!process.env.JINA_API_KEY) {
    console.log('[RAG] JINA_API_KEY not configured - using keyword search only')

    // Fall back to keyword-only search
    const keywordResults = await searchByKeyword(campaignId, sanitizedQuery, {
      limit,
      excludeDmOnly,
      excludeIds: [],
    })

    console.log('[RAG] Keyword-only search results:', keywordResults.length)
    return keywordResults
  }

  try {
    // Generate embedding for query (use retrieval.query task for better matching)
    console.log('[RAG] Generating embedding for query...')
    const queryEmbedding = await generateEmbedding(sanitizedQuery, 'retrieval.query')
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
    let topResults = allResults.slice(0, limit)

    console.log('[RAG] Vector search results:', topResults.length)

    // Always run keyword search to find exact content matches (hybrid search)
    if (enableKeywordFallback) {
      console.log('[RAG] Running keyword search for hybrid results...')
      const keywordResults = await searchByKeyword(campaignId, sanitizedQuery, {
        limit: Math.max(3, limit - topResults.length),
        excludeDmOnly,
        excludeIds: topResults.map(r => r.entity_id),
      })

      if (keywordResults.length > 0) {
        console.log('[RAG] Keyword search found:', keywordResults.length, 'additional results')
        // Add keyword results, they might be more relevant for exact matches
        topResults = [...topResults, ...keywordResults].slice(0, limit)
      }
    }

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

/**
 * Keyword-based search for entities (fallback when vector search has few results)
 * Uses PostgreSQL ILIKE for case-insensitive matching
 */
async function searchByKeyword(
  campaignId: string,
  query: string,
  options: {
    limit?: number
    excludeDmOnly?: boolean
    excludeIds?: string[]
  } = {}
): Promise<SearchResult[]> {
  const { limit = 5, excludeDmOnly = false, excludeIds = [] } = options

  try {
    // Sanitize query - remove null bytes and control characters
    const sanitizedQuery = query.replace(/\x00/g, '').replace(/[\x00-\x1F\x7F]/g, ' ')

    // Create search pattern - handle multi-word by using OR for each word
    const words = sanitizedQuery.toLowerCase().trim().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) {
      console.log('[RAG/Keyword] No valid search words')
      return []
    }

    // Use the first word for primary search (most specific)
    const searchPattern = `%${words[0]}%`
    console.log('[RAG/Keyword] Searching with pattern:', searchPattern, 'from query:', query)

    // Simple text search on entity content
    const results = await sql`
      SELECT
        e.id as entity_id,
        e.name as entity_name,
        e.entity_type,
        COALESCE(SUBSTRING(e.content, 1, 500), '') as chunk_text,
        CASE WHEN e.name ILIKE ${searchPattern} THEN 0.35 ELSE 0.25 END as similarity,
        'entity' as source_type
      FROM entities e
      WHERE e.campaign_id = ${campaignId}
        AND (e.is_dm_only = false OR ${!excludeDmOnly})
        AND (
          e.name ILIKE ${searchPattern}
          OR e.content ILIKE ${searchPattern}
        )
      ORDER BY similarity DESC, e.name
      LIMIT ${limit}
    `

    console.log('[RAG/Keyword] Query returned:', results.length, 'rows')

    // Filter out excluded IDs in JS (simpler than dynamic SQL)
    const excludeSet = new Set(excludeIds)
    const filtered = results.filter(row => !excludeSet.has(row.entity_id))

    console.log('[RAG/Keyword] After excluding:', filtered.length, 'results')

    return filtered.map(row => ({
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      entity_type: row.entity_type,
      chunk_text: row.chunk_text || 'No content',
      similarity: row.similarity,
      source_type: 'entity' as const,
      note_id: row.entity_id,
      note_title: row.entity_name,
      note_type: row.entity_type,
    }))
  } catch (error) {
    console.error('[RAG/Keyword] Search error:', error)
    return []
  }
}
