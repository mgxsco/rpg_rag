import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { generateChatResponse } from '@/lib/ai/chat'
import { ChatMessage } from '@/lib/types'
import { getCampaignSettings, DEFAULT_PROMPTS } from '@/lib/campaign-settings'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit check
  const rateLimitResponse = withRateLimit(session.user.id, 'chat', RATE_LIMITS.chat)
  if (rateLimitResponse) return rateLimitResponse

  // Note: AI availability is now checked per-model in the chat module

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
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
    mode?: 'rag' | 'direct' | 'session-prep'
  }

  if (!message && mode !== 'session-prep') {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  try {
    // Direct mode: just return search results without AI
    if (mode === 'direct') {
      const { searchSimilarChunks } = await import('@/lib/ai/rag')
      const settings = (await import('@/lib/campaign-settings')).getCampaignSettings(campaign.settings)

      const results = await searchSimilarChunks(campaignId, message, {
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

    // Session Prep mode: generate a structured recap for tonight's session
    if (mode === 'session-prep') {
      // Get last 2 completed sessions
      const recentSessions = await db.query.entities.findMany({
        where: and(
          eq(entities.campaignId, campaignId),
          eq(entities.entityType, 'session'),
          eq(entities.sessionStatus, 'completed')
        ),
        orderBy: [desc(entities.sessionNumber)],
        limit: 2,
      })

      // Get active quests
      const activeQuests = await db.query.entities.findMany({
        where: and(
          eq(entities.campaignId, campaignId),
          eq(entities.entityType, 'quest'),
          eq(entities.questStatus, 'active')
        ),
        limit: 10,
      })

      // Also get quests without status (default to active)
      const questsNoStatus = await db.query.entities.findMany({
        where: and(
          eq(entities.campaignId, campaignId),
          eq(entities.entityType, 'quest')
        ),
        limit: 20,
      })
      const additionalActiveQuests = questsNoStatus.filter(
        (q) => !q.questStatus && !activeQuests.find((aq) => aq.id === q.id)
      )

      // Get key NPCs (most recently updated)
      const keyNpcs = await db.query.entities.findMany({
        where: and(
          eq(entities.campaignId, campaignId),
          eq(entities.entityType, 'npc'),
          eq(entities.isDmOnly, false)
        ),
        orderBy: [desc(entities.updatedAt)],
        limit: 10,
      })

      // Build context for the AI
      const contextParts: string[] = []

      if (recentSessions.length > 0) {
        contextParts.push('## Recent Sessions')
        for (const session of recentSessions) {
          contextParts.push(`### Session ${session.sessionNumber}: ${session.name}`)
          if (session.content) {
            contextParts.push(session.content.slice(0, 2000))
          }
        }
      }

      const allActiveQuests = [...activeQuests, ...additionalActiveQuests.slice(0, 5)]
      if (allActiveQuests.length > 0) {
        contextParts.push('\n## Active Quests')
        for (const quest of allActiveQuests) {
          contextParts.push(`### ${quest.name}`)
          if (quest.content) {
            contextParts.push(quest.content.slice(0, 500))
          }
        }
      }

      if (keyNpcs.length > 0) {
        contextParts.push('\n## Key NPCs')
        for (const npc of keyNpcs) {
          contextParts.push(`### ${npc.name}`)
          if (npc.content) {
            contextParts.push(npc.content.slice(0, 300))
          }
        }
      }

      const context = contextParts.join('\n\n')
      const prepPrompt = settings.prompts?.sessionPrepPrompt || DEFAULT_PROMPTS.sessionPrepPrompt

      // Generate the session prep using the chat system
      const response = await generateChatResponse(
        campaignId,
        `Generate a session prep summary for tonight's game. Campaign name: ${campaign.name}\n\nContext:\n${context}`,
        [],
        {
          isDM: false, // Don't include DM-only content
          campaignName: campaign.name,
          settings: campaign.settings,
          systemPromptOverride: prepPrompt,
          skipRag: true, // We're providing our own context
        }
      )

      return NextResponse.json({
        ...response,
        mode: 'session-prep',
        context: {
          sessionsCount: recentSessions.length,
          questsCount: allActiveQuests.length,
          npcsCount: keyNpcs.length,
        },
      })
    }

    // RAG mode: search + AI response
    const response = await generateChatResponse(
      campaignId,
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
