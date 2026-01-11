import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes, noteLinks } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { GraphData } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id

  if (!membership && campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Get all notes
  const allNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      slug: notes.slug,
      noteType: notes.noteType,
      isDmOnly: notes.isDmOnly,
    })
    .from(notes)
    .where(eq(notes.campaignId, params.campaignId))

  // Filter DM-only notes for non-DMs
  const visibleNotes = isDM
    ? allNotes
    : allNotes.filter((n) => !n.isDmOnly)

  // Get all links
  const links = await db
    .select({
      sourceNoteId: noteLinks.sourceNoteId,
      targetNoteId: noteLinks.targetNoteId,
    })
    .from(noteLinks)
    .where(eq(noteLinks.campaignId, params.campaignId))

  // Build graph data
  const noteIds = new Set(visibleNotes.map((n) => n.id))

  const graphData: GraphData = {
    nodes: visibleNotes.map((note) => ({
      id: note.id,
      title: note.title,
      slug: note.slug,
      note_type: note.noteType,
    })),
    links: links
      .filter(
        (link) =>
          noteIds.has(link.sourceNoteId) && noteIds.has(link.targetNoteId)
      )
      .map((link) => ({
        source: link.sourceNoteId,
        target: link.targetNoteId,
      })),
  }

  return NextResponse.json({ graphData, isDM })
}
