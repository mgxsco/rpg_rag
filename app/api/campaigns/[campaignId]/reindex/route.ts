import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'
import { syncEntityEmbeddings } from '@/lib/ai/entity-embeddings'
import { syncNoteLinks } from '@/lib/wikilinks/sync'

// Regenerate embeddings for all entities (and legacy notes) in a campaign
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if JINA_API_KEY is configured
  if (!process.env.JINA_API_KEY) {
    return NextResponse.json({
      error: 'JINA_API_KEY is not configured. Embeddings cannot be generated.',
    }, { status: 400 })
  }

  // Check ownership/membership
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id
  if (!isDM) {
    return NextResponse.json({ error: 'Only DMs can regenerate embeddings' }, { status: 403 })
  }

  const results: Array<{
    type: 'entity' | 'note'
    id: string
    name: string
    success: boolean
    error?: string
  }> = []

  // First, reindex all entities (knowledge graph)
  const allEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.campaignId, params.campaignId))

  console.log(`[Reindex] Found ${allEntities.length} entities to process`)

  for (const entity of allEntities) {
    try {
      console.log(`[Reindex] Processing entity: ${entity.name}`)

      await syncEntityEmbeddings(
        entity.id,
        params.campaignId,
        entity.name,
        entity.content || ''
      )

      results.push({ type: 'entity', id: entity.id, name: entity.name, success: true })
    } catch (error) {
      console.error(`[Reindex] Failed to process entity ${entity.id}:`, error)
      results.push({
        type: 'entity',
        id: entity.id,
        name: entity.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Also reindex legacy notes (for backward compatibility)
  const allNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.campaignId, params.campaignId))

  console.log(`[Reindex] Found ${allNotes.length} legacy notes to process`)

  for (const note of allNotes) {
    try {
      console.log(`[Reindex] Processing note: ${note.title}`)

      // Sync embeddings
      await syncNoteEmbeddings(
        note.id,
        params.campaignId,
        note.title,
        note.content || ''
      )

      // Sync wikilinks
      await syncNoteLinks(note.id, params.campaignId, note.content || '')

      results.push({ type: 'note', id: note.id, name: note.title, success: true })
    } catch (error) {
      console.error(`[Reindex] Failed to process note ${note.id}:`, error)
      results.push({
        type: 'note',
        id: note.id,
        name: note.title,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const entitySuccess = results.filter((r) => r.type === 'entity' && r.success).length
  const noteSuccess = results.filter((r) => r.type === 'note' && r.success).length

  return NextResponse.json({
    success: true,
    message: `Processed ${entitySuccess} of ${allEntities.length} entities, ${noteSuccess} of ${allNotes.length} notes`,
    entities: {
      total: allEntities.length,
      success: entitySuccess,
    },
    notes: {
      total: allNotes.length,
      success: noteSuccess,
    },
    results,
  })
}
