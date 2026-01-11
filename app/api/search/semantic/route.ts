import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchSimilarChunks } from '@/lib/ai/rag'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { campaignId, query, limit = 10 } = body

  if (!campaignId || !query) {
    return NextResponse.json(
      { error: 'Campaign ID and query are required' },
      { status: 400 }
    )
  }

  // Check membership
  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('owner_id')
    .eq('id', campaignId)
    .single()

  if (!membership && campaign?.owner_id !== user.id) {
    return NextResponse.json(
      { error: 'Not a member of this campaign' },
      { status: 403 }
    )
  }

  const isDM = membership?.role === 'dm' || campaign?.owner_id === user.id

  try {
    const results = await searchSimilarChunks(campaignId, query, {
      limit,
      excludeDmOnly: !isDM,
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
