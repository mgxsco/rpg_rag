import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateChatResponse } from '@/lib/ai/chat'
import { ChatMessage } from '@/lib/types'

export async function POST(
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
    .select('name, owner_id')
    .eq('id', params.campaignId)
    .single()

  if (!membership && campaign?.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not a member of this campaign' }, { status: 403 })
  }

  const isDM = membership?.role === 'dm' || campaign?.owner_id === user.id

  const body = await request.json()
  const { message, history } = body as {
    message: string
    history: ChatMessage[]
  }

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  try {
    const response = await generateChatResponse(
      params.campaignId,
      message,
      history || [],
      {
        isDM,
        campaignName: campaign?.name,
      }
    )

    return NextResponse.json(response)
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
