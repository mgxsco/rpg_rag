import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GraphData } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check membership
  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', user.id)
    .single()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('owner_id')
    .eq('id', params.campaignId)
    .single()

  const isDM = membership?.role === 'dm' || campaign?.owner_id === user.id

  // Get all notes
  let notesQuery = supabase
    .from('notes')
    .select('id, title, slug, note_type')
    .eq('campaign_id', params.campaignId)

  if (!isDM) {
    notesQuery = notesQuery.eq('is_dm_only', false)
  }

  const { data: notes } = await notesQuery

  // Get all links
  const { data: links } = await supabase
    .from('note_links')
    .select('source_note_id, target_note_id')
    .eq('campaign_id', params.campaignId)

  // Build graph data
  const noteIds = new Set(notes?.map((n) => n.id) || [])

  const graphData: GraphData = {
    nodes: notes?.map((note) => ({
      id: note.id,
      title: note.title,
      slug: note.slug,
      note_type: note.note_type,
    })) || [],
    links: links
      ?.filter(
        (link) =>
          noteIds.has(link.source_note_id) && noteIds.has(link.target_note_id)
      )
      .map((link) => ({
        source: link.source_note_id,
        target: link.target_note_id,
      })) || [],
  }

  return NextResponse.json({ graphData, isDM })
}
