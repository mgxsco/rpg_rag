import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, entities, campaigns, campaignMembers } from '@/lib/db'
import { eq, and, desc, asc } from 'drizzle-orm'
import { syncEntityEmbeddings } from '@/lib/ai/entity-embeddings'

async function checkAccess(campaignId: string, userId: string) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return { error: 'Campaign not found', status: 404 }
  }

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  })

  const isOwner = campaign.ownerId === userId
  const isDM = membership?.role === 'dm' || isOwner

  if (!membership && !isOwner) {
    return { error: 'Access denied', status: 403 }
  }

  return { campaign, isDM, membership }
}

/**
 * Get all sessions for a campaign
 * GET /api/campaigns/{campaignId}/sessions
 */
export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkAccess(params.campaignId, session.user.id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const sort = searchParams.get('sort') || 'number'
  const order = searchParams.get('order') || 'desc'

  // Get all sessions (entities with type = 'session')
  let allSessions = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, params.campaignId),
      eq(entities.entityType, 'session')
    ),
  })

  // Filter by DM-only if not DM
  if (!access.isDM) {
    allSessions = allSessions.filter((s) => !s.isDmOnly)
  }

  // Filter by status
  if (status && status !== 'all') {
    allSessions = allSessions.filter((s) => s.sessionStatus === status)
  }

  // Sort sessions
  if (sort === 'number') {
    allSessions.sort((a, b) => {
      const numA = a.sessionNumber ?? 0
      const numB = b.sessionNumber ?? 0
      return order === 'asc' ? numA - numB : numB - numA
    })
  } else if (sort === 'date') {
    allSessions.sort((a, b) => {
      const dateA = a.sessionDate?.getTime() ?? 0
      const dateB = b.sessionDate?.getTime() ?? 0
      return order === 'asc' ? dateA - dateB : dateB - dateA
    })
  }

  // Find next planned session
  const nextSession = allSessions.find((s) => s.sessionStatus === 'planned')

  return NextResponse.json({
    sessions: allSessions,
    nextSession: nextSession || null,
    totalCount: allSessions.length,
    isDM: access.isDM,
  })
}

/**
 * Create a new session
 * POST /api/campaigns/{campaignId}/sessions
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkAccess(params.campaignId, session.user.id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Only DM can create sessions
  if (!access.isDM) {
    return NextResponse.json({ error: 'Only DM can create sessions' }, { status: 403 })
  }

  const body = await request.json()
  const {
    name,
    sessionNumber,
    sessionDate,
    inGameDate,
    sessionStatus = 'planned',
    content = '',
    isDmOnly = false,
  } = body

  if (!name) {
    return NextResponse.json({ error: 'Session name is required' }, { status: 400 })
  }

  // Generate canonical name
  const canonicalName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Check for duplicate
  const existing = await db.query.entities.findFirst({
    where: and(
      eq(entities.campaignId, params.campaignId),
      eq(entities.canonicalName, canonicalName)
    ),
  })

  if (existing) {
    return NextResponse.json(
      { error: 'A session with this name already exists' },
      { status: 400 }
    )
  }

  // Create the session entity
  const [newSession] = await db
    .insert(entities)
    .values({
      campaignId: params.campaignId,
      name,
      canonicalName,
      entityType: 'session',
      content,
      isDmOnly,
      sessionNumber: sessionNumber || null,
      sessionDate: sessionDate ? new Date(sessionDate) : null,
      inGameDate: inGameDate || null,
      sessionStatus,
    })
    .returning()

  // Sync embeddings for RAG search
  try {
    await syncEntityEmbeddings(
      newSession.id,
      params.campaignId,
      newSession.name,
      newSession.content || ''
    )
  } catch (error) {
    console.error('[Sessions] Error syncing embeddings:', error)
  }

  return NextResponse.json(newSession, { status: 201 })
}
