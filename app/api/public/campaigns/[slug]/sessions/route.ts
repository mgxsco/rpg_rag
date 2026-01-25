import { NextRequest, NextResponse } from 'next/server'
import { db, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { checkPublicCampaignAccess, isPublicAccessError } from '@/lib/api/public-access'

type Params = { slug: string }

/**
 * Get all public sessions for a campaign
 * GET /api/public/campaigns/{slug}/sessions
 * Query params:
 *   - status: Filter by session status (completed, planned, cancelled)
 *   - sort: Sort by 'number' or 'date'
 *   - order: 'asc' or 'desc'
 *   - limit: Max results (default 100, max 500)
 *   - offset: Skip N results for pagination
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  const access = await checkPublicCampaignAccess(params.slug)

  if (isPublicAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { campaign } = access
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const sort = searchParams.get('sort') || 'number'
  const order = searchParams.get('order') || 'desc'
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  // Get all public sessions (entities with type = 'session' and not DM-only)
  let allSessions = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.entityType, 'session'),
      eq(entities.isDmOnly, false)
    ),
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      sessionNumber: true,
      sessionDate: true,
      inGameDate: true,
      sessionStatus: true,
      updatedAt: true,
    },
  })

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
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    },
  })
}
