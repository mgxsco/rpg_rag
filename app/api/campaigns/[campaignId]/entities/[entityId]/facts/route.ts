import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, entityFacts, factMentions } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { FactSection } from '@/lib/db/schema'

/**
 * Get facts for an entity
 * GET /api/campaigns/{campaignId}/entities/{entityId}/facts
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string; entityId: string }> }
) {
  const { campaignId, entityId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const isDM = campaign.ownerId === session.user.id || membership?.role === 'dm'

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, entityId),
      eq(entities.campaignId, campaignId)
    ),
  })

  if (!entity) {
    return new Response(JSON.stringify({ error: 'Entity not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get facts with mentions
  const facts = await db.query.entityFacts.findMany({
    where: eq(entityFacts.entityId, entityId),
    with: {
      mentions: {
        with: {
          mentionedEntity: {
            columns: { id: true, name: true, entityType: true },
          },
        },
      },
    },
    orderBy: [desc(entityFacts.createdAt)],
  })

  // Filter out DM-only facts for non-DMs
  const filteredFacts = isDM
    ? facts
    : facts.filter(f => !f.isDmOnly)

  return new Response(
    JSON.stringify({
      entityId,
      entityName: entity.name,
      facts: filteredFacts.map(f => ({
        id: f.id,
        content: f.content,
        section: f.section,
        confidence: parseFloat(f.confidence || '1.0'),
        isDmOnly: f.isDmOnly,
        sourceExcerpt: f.sourceExcerpt,
        createdAt: f.createdAt,
        mentions: f.mentions.map(m => ({
          entityId: m.mentionedEntityId,
          entityName: (m as any).mentionedEntity?.name,
          entityType: (m as any).mentionedEntity?.entityType,
          relationshipType: m.relationshipType,
        })),
      })),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

/**
 * Add a fact to an entity
 * POST /api/campaigns/{campaignId}/entities/{entityId}/facts
 *
 * Body: {
 *   content: string,
 *   section: FactSection,
 *   isDmOnly?: boolean,
 *   sourceExcerpt?: string,
 *   mentions?: Array<{ entityId: string, relationshipType?: string }>
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string; entityId: string }> }
) {
  const { campaignId, entityId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, entityId),
      eq(entities.campaignId, campaignId)
    ),
  })

  if (!entity) {
    return new Response(JSON.stringify({ error: 'Entity not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json()
    const { content, section, isDmOnly = false, sourceExcerpt, mentions = [] } = body

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const validSections: FactSection[] = [
      'appearance', 'personality', 'history', 'abilities', 'possessions',
      'relationships', 'location', 'goals', 'secrets', 'other'
    ]
    if (!validSections.includes(section)) {
      return new Response(JSON.stringify({ error: 'Invalid section' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const factId = uuidv4()
    await db.insert(entityFacts).values({
      id: factId,
      campaignId,
      entityId,
      content,
      section,
      isDmOnly,
      sourceExcerpt: sourceExcerpt || null,
      confidence: '1.0', // Manual facts have full confidence
      createdBy: session.user.id,
    })

    // Add mentions
    for (const mention of mentions) {
      if (mention.entityId) {
        await db.insert(factMentions).values({
          id: uuidv4(),
          factId,
          mentionedEntityId: mention.entityId,
          relationshipType: mention.relationshipType || null,
        })
      }
    }

    return new Response(
      JSON.stringify({ factId }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Add-Fact] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to add fact' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Delete a fact
 * DELETE /api/campaigns/{campaignId}/entities/{entityId}/facts?factId=xxx
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ campaignId: string; entityId: string }> }
) {
  const { campaignId, entityId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const factId = url.searchParams.get('factId')

  if (!factId) {
    return new Response(JSON.stringify({ error: 'factId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify fact belongs to entity
  const fact = await db.query.entityFacts.findFirst({
    where: and(
      eq(entityFacts.id, factId),
      eq(entityFacts.entityId, entityId)
    ),
  })

  if (!fact) {
    return new Response(JSON.stringify({ error: 'Fact not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Delete fact (mentions cascade)
  await db.delete(entityFacts).where(eq(entityFacts.id, factId))

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
