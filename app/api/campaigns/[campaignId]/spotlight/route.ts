import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, desc, or, inArray } from 'drizzle-orm'

// Lazy-initialize Anthropic client
let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

interface SpotlightCache {
  data: SpotlightData
  timestamp: number
  sessionCount: number
}

interface SpotlightData {
  summary: string
  keyTension: string
  atStake: string
  featuredEntities: Array<{
    id: string
    name: string
    entityType: string
  }>
  lastUpdated: string
}

// In-memory cache (per campaign)
const spotlightCache = new Map<string, SpotlightCache>()
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 1 week

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params

    // Check membership
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get current session count for cache invalidation
    const sessionEntities = await db.query.entities.findMany({
      where: and(
        eq(entities.campaignId, campaignId),
        eq(entities.entityType, 'session')
      ),
    })
    const currentSessionCount = sessionEntities.length

    // Check cache
    const cached = spotlightCache.get(campaignId)
    if (
      cached &&
      Date.now() - cached.timestamp < CACHE_DURATION &&
      cached.sessionCount === currentSessionCount
    ) {
      return NextResponse.json(cached.data)
    }

    // Generate new spotlight
    const spotlight = await generateSpotlight(campaignId, campaign.name, campaign.language)

    // Cache the result
    spotlightCache.set(campaignId, {
      data: spotlight,
      timestamp: Date.now(),
      sessionCount: currentSessionCount,
    })

    return NextResponse.json(spotlight)
  } catch (error) {
    console.error('[Spotlight] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate spotlight' },
      { status: 500 }
    )
  }
}

async function generateSpotlight(
  campaignId: string,
  campaignName: string,
  language: string
): Promise<SpotlightData> {
  // Fetch recent completed sessions
  const recentSessions = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'session'),
      eq(entities.sessionStatus, 'completed')
    ),
    orderBy: [desc(entities.sessionNumber)],
    limit: 3,
  })

  // Fetch active quests
  const quests = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'quest')
    ),
    limit: 5,
  })

  // Fetch key NPCs (those updated recently)
  const recentNPCs = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'npc')
    ),
    orderBy: [desc(entities.updatedAt)],
    limit: 5,
  })

  // Fetch player characters
  const playerCharacters = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'player_character')
    ),
    limit: 10,
  })

  // If no sessions and few entities, return a default spotlight
  if (recentSessions.length === 0 && quests.length === 0 && recentNPCs.length === 0) {
    return {
      summary: language === 'pt-BR'
        ? 'Uma nova aventura aguarda! Esta campanha está apenas começando sua jornada épica.'
        : 'A new adventure awaits! This campaign is just beginning its epic journey.',
      keyTension: language === 'pt-BR'
        ? 'A história ainda está por ser escrita...'
        : 'The story is yet to be written...',
      atStake: language === 'pt-BR'
        ? 'O destino de mundos desconhecidos'
        : 'The fate of unknown worlds',
      featuredEntities: [],
      lastUpdated: new Date().toISOString(),
    }
  }

  // Build context for AI
  let context = `Campaign: ${campaignName}\n\n`

  if (recentSessions.length > 0) {
    context += 'Recent Sessions:\n'
    for (const session of recentSessions) {
      context += `- Session ${session.sessionNumber}: ${session.name}\n`
      if (session.content) {
        // Take first 500 chars of content
        context += `  ${session.content.slice(0, 500)}...\n`
      }
    }
    context += '\n'
  }

  if (quests.length > 0) {
    context += 'Active Quests:\n'
    for (const quest of quests) {
      context += `- ${quest.name}: ${quest.content?.slice(0, 200) || 'No description'}...\n`
    }
    context += '\n'
  }

  if (recentNPCs.length > 0) {
    context += 'Key NPCs:\n'
    for (const npc of recentNPCs) {
      context += `- ${npc.name}: ${npc.content?.slice(0, 150) || 'No description'}...\n`
    }
    context += '\n'
  }

  if (playerCharacters.length > 0) {
    context += 'Player Characters:\n'
    for (const pc of playerCharacters) {
      context += `- ${pc.name}\n`
    }
  }

  // Generate AI summary
  const anthropic = getAnthropic()

  const languageInstruction = language === 'pt-BR'
    ? 'Respond in Brazilian Portuguese.'
    : 'Respond in English.'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: `You are a dramatic narrator for a tabletop RPG campaign. Your role is to summarize the current state of the campaign in an engaging, dramatic way that captures the essence of the story.

${languageInstruction}

Based on the campaign context provided, generate:
1. A dramatic 2-3 sentence summary of the current situation (capture the mood and stakes)
2. The key tension or conflict currently driving the story
3. What's at stake (the consequences if heroes fail)

Format your response as JSON:
{
  "summary": "dramatic summary here",
  "keyTension": "the main conflict",
  "atStake": "what could be lost"
}

Be vivid and evocative but stay true to the content provided. If information is limited, work with what's available.`,
    messages: [
      {
        role: 'user',
        content: context,
      },
    ],
  })

  // Parse AI response
  const textContent = response.content.find((block) => block.type === 'text')
  const responseText = textContent?.type === 'text' ? textContent.text : '{}'

  let parsed: { summary?: string; keyTension?: string; atStake?: string }
  try {
    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  } catch {
    parsed = {}
  }

  // Collect featured entities
  const featuredEntities: SpotlightData['featuredEntities'] = []

  // Add most recent session
  if (recentSessions[0]) {
    featuredEntities.push({
      id: recentSessions[0].id,
      name: recentSessions[0].name,
      entityType: 'session',
    })
  }

  // Add first quest
  if (quests[0]) {
    featuredEntities.push({
      id: quests[0].id,
      name: quests[0].name,
      entityType: 'quest',
    })
  }

  // Add first NPC
  if (recentNPCs[0]) {
    featuredEntities.push({
      id: recentNPCs[0].id,
      name: recentNPCs[0].name,
      entityType: 'npc',
    })
  }

  return {
    summary: parsed.summary || (language === 'pt-BR'
      ? 'A aventura continua...'
      : 'The adventure continues...'),
    keyTension: parsed.keyTension || (language === 'pt-BR'
      ? 'Forças misteriosas estão em movimento'
      : 'Mysterious forces are at play'),
    atStake: parsed.atStake || (language === 'pt-BR'
      ? 'O futuro permanece incerto'
      : 'The future remains uncertain'),
    featuredEntities,
    lastUpdated: new Date().toISOString(),
  }
}

// Force refresh endpoint
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params

    // Clear cache for this campaign
    spotlightCache.delete(campaignId)

    // Re-fetch
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const spotlight = await generateSpotlight(campaignId, campaign.name, campaign.language)

    // Cache the result
    const sessionEntities = await db.query.entities.findMany({
      where: and(
        eq(entities.campaignId, campaignId),
        eq(entities.entityType, 'session')
      ),
    })

    spotlightCache.set(campaignId, {
      data: spotlight,
      timestamp: Date.now(),
      sessionCount: sessionEntities.length,
    })

    return NextResponse.json(spotlight)
  } catch (error) {
    console.error('[Spotlight Refresh] Error:', error)
    return NextResponse.json(
      { error: 'Failed to refresh spotlight' },
      { status: 500 }
    )
  }
}
