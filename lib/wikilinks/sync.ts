import { createClient } from '@/lib/supabase/server'
import { parseWikilinks, titleToSlug } from './parser'

export interface SyncResult {
  linkedNotes: string[] // IDs of notes that were linked
  unresolvedLinks: string[] // Titles that couldn't be resolved
}

/**
 * Sync wikilinks for a note
 * - Parses all [[wikilinks]] from content
 * - Resolves them to existing notes
 * - Updates note_links table
 * - Returns unresolved links for potential creation prompts
 */
export async function syncNoteLinks(
  noteId: string,
  campaignId: string,
  content: string
): Promise<SyncResult> {
  const supabase = createClient()

  // Parse wikilinks from content
  const links = parseWikilinks(content)
  const targetTitles = [...new Set(links.map((l) => l.target.toLowerCase()))]

  // Get all notes in campaign to resolve links
  const { data: campaignNotes } = await supabase
    .from('notes')
    .select('id, title, slug')
    .eq('campaign_id', campaignId)

  // Create lookup maps
  const noteByTitle = new Map<string, string>()
  const noteBySlug = new Map<string, string>()

  campaignNotes?.forEach((note) => {
    noteByTitle.set(note.title.toLowerCase(), note.id)
    noteBySlug.set(note.slug, note.id)
  })

  // Resolve links
  const linkedNoteIds: string[] = []
  const unresolvedLinks: string[] = []

  for (const title of targetTitles) {
    const noteId = noteByTitle.get(title) || noteBySlug.get(titleToSlug(title))
    if (noteId) {
      linkedNoteIds.push(noteId)
    } else {
      unresolvedLinks.push(title)
    }
  }

  // Delete existing links from this note
  await supabase
    .from('note_links')
    .delete()
    .eq('source_note_id', noteId)

  // Insert new links
  if (linkedNoteIds.length > 0) {
    const linkInserts = linkedNoteIds.map((targetNoteId) => ({
      source_note_id: noteId,
      target_note_id: targetNoteId,
      campaign_id: campaignId,
    }))

    await supabase.from('note_links').insert(linkInserts)
  }

  return {
    linkedNotes: linkedNoteIds,
    unresolvedLinks,
  }
}

/**
 * Get backlinks for a note (notes that link TO this note)
 */
export async function getBacklinks(noteId: string) {
  const supabase = createClient()

  const { data } = await supabase
    .from('note_links')
    .select(`
      source_note:notes!source_note_id(
        id,
        title,
        slug,
        note_type
      )
    `)
    .eq('target_note_id', noteId)

  return data?.map((link) => link.source_note).filter(Boolean) || []
}
