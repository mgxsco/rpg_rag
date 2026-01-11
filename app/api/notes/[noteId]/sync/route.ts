import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncNoteLinks } from '@/lib/wikilinks/sync'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'

export async function POST(
  request: Request,
  { params }: { params: { noteId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the note
  const { data: note, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', params.noteId)
    .single()

  if (error || !note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  // Check if user has access (is DM or owner)
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('owner_id')
    .eq('id', note.campaign_id)
    .single()

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', note.campaign_id)
    .eq('user_id', user.id)
    .single()

  const isDM = membership?.role === 'dm' || campaign?.owner_id === user.id
  if (!isDM) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    // Sync wikilinks
    const linkResult = await syncNoteLinks(
      note.id,
      note.campaign_id,
      note.content
    )

    // Sync embeddings
    await syncNoteEmbeddings(
      note.id,
      note.campaign_id,
      note.title,
      note.content
    )

    return NextResponse.json({
      success: true,
      linkedNotes: linkResult.linkedNotes.length,
      unresolvedLinks: linkResult.unresolvedLinks,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync note' },
      { status: 500 }
    )
  }
}
