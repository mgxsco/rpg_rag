import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, notes, campaigns, campaignMembers } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { titleToSlug } from '@/lib/wikilinks/parser'
import { syncNoteLinks } from '@/lib/wikilinks/sync'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'

async function checkAccess(campaignId: string, userId: string) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return { error: 'Campaign not found', status: 404 }
  }

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  })

  const isOwner = campaign.ownerId === userId
  const isDM = membership?.role === 'dm' || isOwner

  if (!membership && !isOwner) {
    return { error: 'Access denied', status: 403 }
  }

  return { campaign, isDM, membership }
}

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkAccess(params.campaignId, session.user.id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

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

  return NextResponse.json({ notes: result, isDM: access.isDM })
}

export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkAccess(params.campaignId, session.user.id)
  if ('error' in access) {
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
