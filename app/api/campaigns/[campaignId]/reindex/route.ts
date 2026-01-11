import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'
import { syncNoteLinks } from '@/lib/wikilinks/sync'

// Regenerate embeddings for all notes in a campaign
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if VOYAGE_API_KEY is configured
  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({
      error: 'VOYAGE_API_KEY is not configured. Embeddings cannot be generated.',
    }, { status: 400 })
  }

  // Check ownership/membership
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id
  if (!isDM) {
    return NextResponse.json({ error: 'Only DMs can regenerate embeddings' }, { status: 403 })
  }

  // Get all notes in campaign
  const allNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.campaignId, params.campaignId))

  const results = []

  for (const note of allNotes) {
    try {
      // Sync embeddings
      await syncNoteEmbeddings(
        note.id,
        params.campaignId,
        note.title,
        note.content || ''
      )

      // Sync wikilinks
      await syncNoteLinks(note.id, params.campaignId, note.content || '')

      results.push({ noteId: note.id, title: note.title, success: true })
    } catch (error) {
      console.error(`Failed to process note ${note.id}:`, error)
      results.push({
        noteId: note.id,
        title: note.title,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const successCount = results.filter((r) => r.success).length

  return NextResponse.json({
    success: true,
    message: `Processed ${successCount} of ${allNotes.length} notes`,
    results,
  })
}
