import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, notes } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { titleToSlug } from '@/lib/wikilinks/parser'
import { syncNoteLinks } from '@/lib/wikilinks/sync'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'
import { checkCampaignAccess, isAccessError } from '@/lib/api/access'

/**
 * List notes for a campaign
 * GET /api/campaigns/{campaignId}/notes
 * Query params:
 *   - type: Filter by note type
 *   - limit: Max results (default 100, max 500)
 *   - offset: Skip N results for pagination
 */
export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = db
    .select()
    .from(notes)
    .where(eq(notes.campaignId, params.campaignId))
    .orderBy(desc(notes.updatedAt))

  const allNotes = await query

  // Filter DM-only notes for non-DMs
  const filteredNotes = access.isDM
    ? allNotes
    : allNotes.filter((n) => !n.isDmOnly)

  // Filter by type if specified
  const result = type
    ? filteredNotes.filter((n) => n.noteType === type)
    : filteredNotes

  // Apply pagination
  const totalCount = result.length
  const paginatedResult = result.slice(offset, offset + limit)

  return NextResponse.json({
    notes: paginatedResult,
    isDM: access.isDM,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    },
  })
}

export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const body = await request.json()
  const { title, content, noteType, tags, isDmOnly } = body

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const slug = titleToSlug(title)

  // Check for duplicate slug
  const existing = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, slug)
    ),
  })

  if (existing) {
    return NextResponse.json(
      { error: 'A note with this title already exists' },
      { status: 400 }
    )
  }

  const [note] = await db
    .insert(notes)
    .values({
      campaignId: params.campaignId,
      authorId: session.user.id,
      title,
      slug,
      content: content || '',
      noteType: noteType || 'freeform',
      tags: tags || [],
      isDmOnly: isDmOnly || false,
    })
    .returning()

  // Sync wikilinks and embeddings
  try {
    await syncNoteLinks(note.id, params.campaignId, note.content || '')
    await syncNoteEmbeddings(note.id, params.campaignId, note.title, note.content || '')
  } catch (error) {
    console.error('Error syncing note:', error)
  }

  return NextResponse.json(note)
}
