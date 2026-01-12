import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateChatResponse } from '@/lib/ai/chat'
import { ChatMessage } from '@/lib/types'
import { getCampaignSettings } from '@/lib/campaign-settings'

export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if ANTHROPIC_API_KEY is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      content: 'Chat is not available. ANTHROPIC_API_KEY is not configured in environment variables.',
      sources: [],
    })
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

  if (!membership && campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Not a member of this campaign' }, { status: 403 })
  }

  const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id

  // Get campaign settings
  const settings = getCampaignSettings(campaign.settings)

  // Check if player chat is enabled (for non-DMs)
  if (!isDM && !settings.search.enablePlayerChat) {
    return NextResponse.json({
      content: 'The Oracle is currently unavailable for players. The Dungeon Master can enable it in campaign settings.',
      sources: [],
    })
  }

  const body = await request.json()
  const { message, history, mode = 'rag' } = body as {
    message: string
    history: ChatMessage[]
    mode?: 'rag' | 'direct'
  }

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  try {
    // Direct mode: just return search results without AI
    if (mode === 'direct') {
      const { searchSimilarChunks } = await import('@/lib/ai/rag')
      const settings = (await import('@/lib/campaign-settings')).getCampaignSettings(campaign.settings)

      const results = await searchSimilarChunks(params.campaignId, message, {
        limit: settings.search.resultLimit,
        threshold: settings.search.similarityThreshold,
        excludeDmOnly: !isDM,
      })

      return NextResponse.json({
        content: null,
        sources: results,
        mode: 'direct',
      })
    }

    // RAG mode: search + AI response
    const response = await generateChatResponse(
      params.campaignId,
      message,
      history || [],
      {
        isDM,
        campaignName: campaign.name,
        settings: campaign.settings,
      }
    )

    return NextResponse.json({ ...response, mode: 'rag' })
  } catch (error) {
    console.error('Chat error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        content: `Error: ${errorMessage}`,
        sources: [],
      }
    )
  }
}
