import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { updateEntitySummary } from '@/lib/ai/extraction/summary'
import type { AIModel } from '@/lib/db/schema'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const maxDuration = 60

/**
 * Regenerate wiki summary for an entity from its facts
 * POST /api/campaigns/{campaignId}/entities/{entityId}/regenerate-summary
 *
 * Body: {
 *   model?: AIModel  // Model to use for generation
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

  // Rate limit check
  const rateLimitResponse = withRateLimit(session.user.id, 'extraction', RATE_LIMITS.extraction)
  if (rateLimitResponse) return rateLimitResponse

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
    const body = await request.json().catch(() => ({}))
    const model: AIModel = body.model || 'claude-3-5-haiku-20241022'

    console.log(`[Regenerate-Summary] Regenerating summary for ${entity.name} (${entityId})`)

    await updateEntitySummary(entityId, model)

    // Get updated entity
    const updatedEntity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
      columns: { summary: true, summaryGeneratedAt: true },
    })

    return new Response(
      JSON.stringify({
        success: true,
        summary: updatedEntity?.summary,
        generatedAt: updatedEntity?.summaryGeneratedAt,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Regenerate-Summary] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to regenerate summary' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
