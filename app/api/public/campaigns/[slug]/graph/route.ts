import { NextRequest, NextResponse } from 'next/server'
import { db, entities, relationships } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { checkPublicCampaignAccess, isPublicAccessError } from '@/lib/api/public-access'

type Params = { slug: string }

/**
 * Get public knowledge graph data
 * GET /api/public/campaigns/{slug}/graph
 * Query params:
 *   - center: entityId to center the graph on
 *   - depth: how many hops from center (default 2)
 *   - type: filter by entity type
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
  const centerId = searchParams.get('center')
  const depth = parseInt(searchParams.get('depth') || '2', 10)
  const filterType = searchParams.get('type')

  // Get all public entities
  let allEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.isDmOnly, false)
    ),
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      entityType: true,
    },
  })

  // Filter by type if specified
  if (filterType) {
    allEntities = allEntities.filter((e) => e.entityType === filterType)
  }

  const entityIds = new Set(allEntities.map((e) => e.id))

  // Get all relationships between public entities
  let allRelationships = await db.query.relationships.findMany({
    where: eq(relationships.campaignId, campaign.id),
  })

  // Filter to only include relationships between visible (public) entities
  allRelationships = allRelationships.filter(
    (r) => entityIds.has(r.sourceEntityId) && entityIds.has(r.targetEntityId)
  )

  // If centered, filter to only include entities within depth
  if (centerId && entityIds.has(centerId)) {
    const includedIds = new Set<string>([centerId])
    let currentLevel = new Set<string>([centerId])

    for (let i = 0; i < depth; i++) {
      const nextLevel = new Set<string>()

      for (const rel of allRelationships) {
        if (currentLevel.has(rel.sourceEntityId)) {
          nextLevel.add(rel.targetEntityId)
          includedIds.add(rel.targetEntityId)
        }
        if (currentLevel.has(rel.targetEntityId)) {
          nextLevel.add(rel.sourceEntityId)
          includedIds.add(rel.sourceEntityId)
        }
      }

      currentLevel = nextLevel
    }

    allEntities = allEntities.filter((e) => includedIds.has(e.id))
    allRelationships = allRelationships.filter(
      (r) => includedIds.has(r.sourceEntityId) && includedIds.has(r.targetEntityId)
    )
  }

  // Format for graph visualization (D3-compatible)
  const nodes = allEntities.map((e) => ({
    id: e.id,
    name: e.name,
    canonicalName: e.canonicalName,
    type: e.entityType,
    group: getTypeGroup(e.entityType),
  }))

  const links = allRelationships.map((r) => ({
    id: r.id,
    source: r.sourceEntityId,
    target: r.targetEntityId,
    type: r.relationshipType,
    label: r.relationshipType.replace(/_/g, ' '),
    reverseLabel: r.reverseLabel,
  }))

  // Calculate stats
  const stats = {
    totalNodes: nodes.length,
    totalLinks: links.length,
    nodesByType: {} as Record<string, number>,
    linksByType: {} as Record<string, number>,
  }

  for (const node of nodes) {
    stats.nodesByType[node.type] = (stats.nodesByType[node.type] || 0) + 1
  }

  for (const link of links) {
    stats.linksByType[link.type] = (stats.linksByType[link.type] || 0) + 1
  }

  return NextResponse.json({
    graphData: { nodes, links },
    stats,
  })
}

/**
 * Get numeric group for entity type (for D3 coloring)
 */
function getTypeGroup(type: string): number {
  const groups: Record<string, number> = {
    npc: 1,
    location: 2,
    item: 3,
    quest: 4,
    faction: 5,
    lore: 6,
    session: 7,
    player_character: 8,
    freeform: 9,
  }
  return groups[type] || 0
}
