import { NextRequest, NextResponse } from 'next/server'
import { db, notes, noteLinks, entities, relationships } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { GraphData } from '@/lib/types'
import { withCampaignAuth } from '@/lib/api/auth'

type Params = { campaignId: string }

/**
 * Get graph data for visualization
 * GET /api/campaigns/{campaignId}/graph
 * Query params:
 *   - source: 'entities' (default) or 'notes' (legacy)
 *   - center: entityId to center the graph on
 *   - depth: how many hops from center (default 2)
 *   - type: filter by entity type
 */
export const GET = withCampaignAuth<Params>(async (request, { access, campaignId }) => {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source') || 'entities'

  // Use new entity-based graph by default
  if (source === 'entities') {
    try {
      return await getEntityGraph(campaignId, access.isDM, searchParams)
    } catch (error) {
      console.error('[Graph] Entity graph failed, falling back to notes:', error)
      // Fall back to notes if entity tables don't exist
      return getNotesGraph(campaignId, access.isDM)
    }
  }

  // Legacy: notes-based graph
  return getNotesGraph(campaignId, access.isDM)
})

/**
 * Get entity-based knowledge graph
 */
async function getEntityGraph(
  campaignId: string,
  isDM: boolean,
  searchParams: URLSearchParams
) {
  const centerId = searchParams.get('center')
  const depth = parseInt(searchParams.get('depth') || '2', 10)
  const filterType = searchParams.get('type')

  // Get all entities
  let allEntities = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      entityType: true,
      isDmOnly: true,
    },
  })

  // Filter DM-only for non-DMs
  if (!isDM) {
    allEntities = allEntities.filter((e) => !e.isDmOnly)
  }

  // Filter by type if specified
  if (filterType) {
    allEntities = allEntities.filter((e) => e.entityType === filterType)
  }

  const entityIds = new Set(allEntities.map((e) => e.id))

  // Get all relationships
  let allRelationships = await db.query.relationships.findMany({
    where: eq(relationships.campaignId, campaignId),
  })

  // Filter to only include relationships between visible entities
  allRelationships = allRelationships.filter(
    (r) => entityIds.has(r.sourceEntityId) && entityIds.has(r.targetEntityId)
  )

  // If centered, filter to only include entities within depth
  if (centerId) {
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
    isDM,
    source: 'entities',
  })
}

/**
 * Get legacy notes-based graph
 */
async function getNotesGraph(campaignId: string, isDM: boolean) {
  // Get all notes
  const allNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      slug: notes.slug,
      noteType: notes.noteType,
      isDmOnly: notes.isDmOnly,
    })
    .from(notes)
    .where(eq(notes.campaignId, campaignId))

  // Filter DM-only notes for non-DMs
  const visibleNotes = isDM
    ? allNotes
    : allNotes.filter((n) => !n.isDmOnly)

  // Get all links
  const links = await db
    .select({
      sourceNoteId: noteLinks.sourceNoteId,
      targetNoteId: noteLinks.targetNoteId,
    })
    .from(noteLinks)
    .where(eq(noteLinks.campaignId, campaignId))

  // Build graph data
  const noteIds = new Set(visibleNotes.map((n) => n.id))

  const graphData: GraphData = {
    nodes: visibleNotes.map((note) => ({
      id: note.id,
      title: note.title,
      slug: note.slug,
      note_type: note.noteType,
    })),
    links: links
      .filter(
        (link) =>
          noteIds.has(link.sourceNoteId) && noteIds.has(link.targetNoteId)
      )
      .map((link) => ({
        source: link.sourceNoteId,
        target: link.targetNoteId,
      })),
  }

  return NextResponse.json({ graphData, isDM, source: 'notes' })
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
