import { NextRequest, NextResponse } from 'next/server'
import { db, entities, campaignMembers } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { syncEntityEmbeddings } from '@/lib/ai/entity-embeddings'
import { withCampaignAuth } from '@/lib/api/auth'

type Params = { campaignId: string }

/**
 * List all entities for a campaign
 * GET /api/campaigns/{campaignId}/entities
 * Query params:
 *   - type: Filter by entity type
 *   - search: Search by name
 *   - limit: Max results (default 100, max 500)
 *   - offset: Skip N results for pagination
 *   - knownBy: Filter to entities known by a specific character ID
 */
export const GET = withCampaignAuth<Params>(async (request, { access, campaignId, user }) => {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')
  const knownBy = searchParams.get('knownBy')

  // Get the player's membership if not DM (needed for journal filtering)
  let playerMemberId: string | null = null
  if (!access.isDM) {
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, user.id)
      ),
    })
    playerMemberId = membership?.id || null
  }

  // Base query
  let allEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.campaignId, campaignId))
    .orderBy(desc(entities.updatedAt))

  // Filter DM-only entities for non-DMs
  let filteredEntities = access.isDM
    ? allEntities
    : allEntities.filter((e) => !e.isDmOnly)

  // Filter journal entries: players only see their own, DMs see all
  if (!access.isDM && playerMemberId) {
    filteredEntities = filteredEntities.filter((e) => {
      if (e.entityType === 'journal_entry') {
        return e.playerId === playerMemberId
      }
      return true
    })
  }

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

  // Filter by character knowledge if specified
  if (knownBy) {
    const { characterKnowledge } = await import('@/lib/db/schema')
    const knownEntityIds = await db
      .select({ entityId: characterKnowledge.entityId })
      .from(characterKnowledge)
      .where(eq(characterKnowledge.characterId, knownBy))

    const knownSet = new Set(knownEntityIds.map((k) => k.entityId))
    result = result.filter((e) => knownSet.has(e.id))
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
})

/**
 * Create a new entity manually
 * POST /api/campaigns/{campaignId}/entities
 */
export const POST = withCampaignAuth<Params>(async (request, { campaignId }) => {
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
      eq(entities.campaignId, campaignId),
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
      campaignId,
      name,
      canonicalName,
      entityType,
      content: content || '',
      aliases: aliases || [],
      tags: tags || [],
      isDmOnly: isDmOnly || false,
      playerId: ['player_character', 'journal_entry'].includes(entityType) ? playerId || null : null,
    })
    .returning()

  // Generate embeddings
  try {
    await syncEntityEmbeddings(
      entity.id,
      campaignId,
      entity.name,
      entity.content || ''
    )
  } catch (error) {
    console.error('[Entities] Error syncing embeddings:', error)
  }

  return NextResponse.json(entity)
})
