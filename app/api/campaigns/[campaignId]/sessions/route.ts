import { NextRequest, NextResponse } from 'next/server'
import { db, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { syncEntityEmbeddings } from '@/lib/ai/entity-embeddings'
import { withCampaignAuth, withDMAuth } from '@/lib/api/auth'

type Params = { campaignId: string }

/**
 * Get all sessions for a campaign
 * GET /api/campaigns/{campaignId}/sessions
 * Query params:
 *   - status: Filter by session status
 *   - sort: Sort by 'number' or 'date'
 *   - order: 'asc' or 'desc'
 *   - limit: Max results (default 100, max 500)
 *   - offset: Skip N results for pagination
 */
export const GET = withCampaignAuth<Params>(async (request, { access, campaignId }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const sort = searchParams.get('sort') || 'number'
  const order = searchParams.get('order') || 'desc'
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  // Get all sessions (entities with type = 'session')
  let allSessions = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
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

  // Find next planned session (before pagination)
  const nextSession = allSessions.find((s) => s.sessionStatus === 'planned')

  // Apply pagination
  const totalCount = allSessions.length
  const paginatedSessions = allSessions.slice(offset, offset + limit)

  return NextResponse.json({
    sessions: paginatedSessions,
    nextSession: nextSession || null,
    isDM: access.isDM,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    },
  })
})

/**
 * Create a new session
 * POST /api/campaigns/{campaignId}/sessions
 */
export const POST = withDMAuth<Params>(async (request, { campaignId }) => {
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
      eq(entities.campaignId, campaignId),
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
      campaignId,
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
      campaignId,
      newSession.name,
      newSession.content || ''
    )
  } catch (error) {
    console.error('[Sessions] Error syncing embeddings:', error)
  }

  return NextResponse.json(newSession, { status: 201 })
})
