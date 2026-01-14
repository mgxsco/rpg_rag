import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, notes, noteVersions } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { titleToSlug } from '@/lib/wikilinks/parser'
import { syncNoteLinks } from '@/lib/wikilinks/sync'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'
import { checkCampaignAccess, isAccessError } from '@/lib/api/access'

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string; slug: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const note = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, params.slug)
    ),
    with: {
      author: true,
    },
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  // Check DM-only access
  if (note.isDmOnly && !access.isDM) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  return NextResponse.json({ ...note, isDM: access.isDM })
}

export async function PUT(
  request: Request,
  { params }: { params: { campaignId: string; slug: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const note = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, params.slug)
    ),
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  const body = await request.json()
  const { title, content, noteType, tags, isDmOnly } = body

  // Save version before updating
  await db.insert(noteVersions).values({
    noteId: note.id,
    title: note.title,
    content: note.content || '',
    editedBy: session.user.id,
  })

  const newSlug = title ? titleToSlug(title) : note.slug

  // Check for slug conflict if title changed
  if (newSlug !== note.slug) {
    const existing = await db.query.notes.findFirst({
      where: and(
        eq(notes.campaignId, params.campaignId),
        eq(notes.slug, newSlug)
      ),
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A note with this title already exists' },
        { status: 400 }
      )
    }
  }

  const [updated] = await db
    .update(notes)
    .set({
      title: title || note.title,
      slug: newSlug,
      content: content ?? note.content,
      noteType: noteType || note.noteType,
      tags: tags || note.tags,
      isDmOnly: isDmOnly ?? note.isDmOnly,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, note.id))
    .returning()

  // Sync wikilinks and embeddings in background
  try {
    await syncNoteLinks(updated.id, params.campaignId, updated.content || '')
    await syncNoteEmbeddings(updated.id, params.campaignId, updated.title, updated.content || '')
  } catch (error) {
    console.error('Error syncing note:', error)
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: { campaignId: string; slug: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const note = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, params.slug)
    ),
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  await db.delete(notes).where(eq(notes.id, note.id))

  return NextResponse.json({ success: true })
}
