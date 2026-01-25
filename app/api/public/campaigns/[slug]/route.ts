import { NextRequest, NextResponse } from 'next/server'
import { db, entities, relationships } from '@/lib/db'
import { eq, and, sql } from 'drizzle-orm'
import { checkPublicCampaignAccess, isPublicAccessError } from '@/lib/api/public-access'

type Params = { slug: string }

/**
 * Get public campaign info
 * GET /api/public/campaigns/{slug}
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

  // Get stats (only counting non-DM-only content)
  const [entityStats, relationshipCount] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        byType: sql<Record<string, number>>`json_object_agg(entity_type, count) filter (where count > 0)`,
      })
      .from(
        db
          .select({
            entityType: entities.entityType,
            count: sql<number>`count(*)::int`,
          })
          .from(entities)
          .where(and(
            eq(entities.campaignId, campaign.id),
            eq(entities.isDmOnly, false)
          ))
          .groupBy(entities.entityType)
          .as('type_counts')
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(relationships)
      .innerJoin(
        entities,
        and(
          eq(relationships.sourceEntityId, entities.id),
          eq(entities.isDmOnly, false)
        )
      )
      .where(eq(relationships.campaignId, campaign.id)),
  ])

  // Count sessions separately
  const sessionCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entities)
    .where(and(
      eq(entities.campaignId, campaign.id),
      eq(entities.entityType, 'session'),
      eq(entities.isDmOnly, false)
    ))

  return NextResponse.json({
    campaign: {
      name: campaign.name,
      description: campaign.description,
      slug: campaign.publicSlug,
    },
    stats: {
      entities: entityStats[0]?.total || 0,
      entityTypes: entityStats[0]?.byType || {},
      relationships: relationshipCount[0]?.count || 0,
      sessions: sessionCount[0]?.count || 0,
    },
  })
}
