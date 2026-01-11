import { db, notes, noteLinks } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
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
  // Parse wikilinks from content
  const links = parseWikilinks(content)
  const targetTitles = [...new Set(links.map((l) => l.target.toLowerCase()))]

  // Get all notes in campaign to resolve links
  const campaignNotes = await db
    .select({ id: notes.id, title: notes.title, slug: notes.slug })
    .from(notes)
    .where(eq(notes.campaignId, campaignId))

  // Create lookup maps
  const noteByTitle = new Map<string, string>()
  const noteBySlug = new Map<string, string>()

  campaignNotes.forEach((note) => {
    noteByTitle.set(note.title.toLowerCase(), note.id)
    noteBySlug.set(note.slug, note.id)
  })

  // Resolve links
  const linkedNoteIds: string[] = []
  const unresolvedLinks: string[] = []

  for (const title of targetTitles) {
    const resolvedNoteId = noteByTitle.get(title) || noteBySlug.get(titleToSlug(title))
    if (resolvedNoteId && resolvedNoteId !== noteId) {
      linkedNoteIds.push(resolvedNoteId)
    } else if (!resolvedNoteId) {
      unresolvedLinks.push(title)
    }
  }

  // Delete existing links from this note
  await db.delete(noteLinks).where(eq(noteLinks.sourceNoteId, noteId))

  // Insert new links
  if (linkedNoteIds.length > 0) {
    const linkInserts = linkedNoteIds.map((targetNoteId) => ({
      sourceNoteId: noteId,
      targetNoteId: targetNoteId,
      campaignId: campaignId,
    }))

    await db.insert(noteLinks).values(linkInserts)
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
  const backlinks = await db.query.noteLinks.findMany({
    where: eq(noteLinks.targetNoteId, noteId),
    with: {
      sourceNote: true,
    },
  })

  return backlinks.map((link) => link.sourceNote).filter(Boolean)
}
