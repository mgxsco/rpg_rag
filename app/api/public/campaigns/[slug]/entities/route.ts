import { NextRequest, NextResponse } from 'next/server'
import { db, entities } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { checkPublicCampaignAccess, isPublicAccessError } from '@/lib/api/public-access'

type Params = { slug: string }

/**
 * List all public entities for a campaign
 * GET /api/public/campaigns/{slug}/entities
 * Query params:
 *   - type: Filter by entity type
 *   - search: Search by name
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
  const type = searchParams.get('type')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  // Get all non-DM-only entities
  let allEntities = await db
    .select({
      id: entities.id,
      name: entities.name,
      canonicalName: entities.canonicalName,
      entityType: entities.entityType,
      aliases: entities.aliases,
      tags: entities.tags,
      updatedAt: entities.updatedAt,
      // Session-specific fields
      sessionNumber: entities.sessionNumber,
      sessionDate: entities.sessionDate,
      sessionStatus: entities.sessionStatus,
    })
    .from(entities)
    .where(and(
      eq(entities.campaignId, campaign.id),
      eq(entities.isDmOnly, false)
    ))
    .orderBy(desc(entities.updatedAt))

  // Filter by type if specified
  let result = type
    ? allEntities.filter((e) => e.entityType === type)
    : allEntities

  // Filter by search term if specified
  if (search) {
    const searchLower = search.toLowerCase()
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(searchLower) ||
        e.aliases?.some((a) => a.toLowerCase().includes(searchLower))
    )
  }

  // Apply pagination
  const totalCount = result.length
  const paginatedResult = result.slice(offset, offset + limit)

  return NextResponse.json({
    entities: paginatedResult,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    },
  })
}
