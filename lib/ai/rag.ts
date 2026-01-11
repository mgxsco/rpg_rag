import { createClient } from '@/lib/supabase/server'
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

  const supabase = createClient()

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query)

  // Call the search function
  const { data, error } = await supabase.rpc('search_embeddings', {
    query_embedding: queryEmbedding,
    match_campaign_id: campaignId,
    match_threshold: threshold,
    match_count: limit,
    exclude_dm_only: excludeDmOnly,
  })

  if (error) {
    console.error('Search error:', error)
    return []
  }

  return (data || []).map((result: any) => ({
    note_id: result.note_id,
    note_title: result.note_title,
    note_slug: result.note_slug,
    note_type: result.note_type,
    chunk_text: result.chunk_text,
    similarity: result.similarity,
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
