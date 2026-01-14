import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, entities, relationships } from '@/lib/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { syncEntityEmbeddings } from '@/lib/ai/entity-embeddings'
import { checkCampaignAccess, isAccessError } from '@/lib/api/access'

/**
 * List all entities for a campaign
 * GET /api/campaigns/{campaignId}/entities
 * Query params:
 *   - type: Filter by entity type
 *   - search: Search by name
 *   - limit: Max results (default 100, max 500)
 *   - offset: Skip N results for pagination
 */
export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  // Base query
  let query = db
    .select()
    .from(entities)
    .where(eq(entities.campaignId, params.campaignId))
    .orderBy(desc(entities.updatedAt))

  let allEntities = await query

  // Filter DM-only entities for non-DMs
  const filteredEntities = access.isDM
    ? allEntities
    : allEntities.filter((e) => !e.isDmOnly)

  // Filter by type if specified
  let result = type
    ? filteredEntities.filter((e) => e.entityType === type)
    : filteredEntities

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
    isDM: access.isDM,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    },
  })
}

/**
 * Create a new entity manually
 * POST /api/campaigns/{campaignId}/entities
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await checkCampaignAccess(params.campaignId, session.user.id)
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const body = await request.json()
  const { name, entityType, content, aliases, tags, isDmOnly, playerId } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  if (!entityType) {
    return NextResponse.json({ error: 'Entity type is required' }, { status: 400 })
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
      { error: 'An entity with this name already exists' },
      { status: 400 }
    )
  }

  const [entity] = await db
    .insert(entities)
    .values({
      campaignId: params.campaignId,
      name,
      canonicalName,
      entityType,
      content: content || '',
      aliases: aliases || [],
      tags: tags || [],
      isDmOnly: isDmOnly || false,
      playerId: entityType === 'player_character' ? playerId || null : null,
    })
    .returning()

  // Generate embeddings
  try {
    await syncEntityEmbeddings(
      entity.id,
      params.campaignId,
      entity.name,
      entity.content || ''
    )
  } catch (error) {
    console.error('[Entities] Error syncing embeddings:', error)
  }

  return NextResponse.json(entity)
}
