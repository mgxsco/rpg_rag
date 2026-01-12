import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, relationships, documents } from '@/lib/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { ensureKnowledgeGraphTables } from '@/lib/db/migrations'

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
    with: {
      members: true,
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Check if user has access
  const isMember = campaign.members.some((m) => m.userId === session.user!.id)
  const isOwner = campaign.ownerId === session.user.id

  if (!isMember && !isOwner) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Ensure tables exist
  await ensureKnowledgeGraphTables()

  // Get counts in parallel
  const [
    entityCountResult,
    relationshipCountResult,
    documentCountResult,
    entityTypeCounts,
    recentEntitiesResult,
    recentDocumentsResult,
  ] = await Promise.all([
    // Total entity count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(entities)
      .where(eq(entities.campaignId, params.campaignId)),

    // Total relationship count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(relationships)
      .where(eq(relationships.campaignId, params.campaignId)),

    // Total document count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.campaignId, params.campaignId)),

    // Entity counts by type
    db
      .select({
        type: entities.entityType,
        count: sql<number>`count(*)::int`,
      })
      .from(entities)
      .where(eq(entities.campaignId, params.campaignId))
      .groupBy(entities.entityType)
      .orderBy(desc(sql`count(*)`)),

    // Recent entities
    db
      .select({
        id: entities.id,
        name: entities.name,
        entityType: entities.entityType,
        updatedAt: entities.updatedAt,
      })
      .from(entities)
      .where(eq(entities.campaignId, params.campaignId))
      .orderBy(desc(entities.updatedAt))
      .limit(5),

    // Recent documents
    db.query.documents.findMany({
      where: eq(documents.campaignId, params.campaignId),
      orderBy: desc(documents.createdAt),
      limit: 5,
      with: {
        uploader: true,
      },
    }),
  ])

  return NextResponse.json({
    entityCount: entityCountResult[0]?.count ?? 0,
    relationshipCount: relationshipCountResult[0]?.count ?? 0,
    documentCount: documentCountResult[0]?.count ?? 0,
    memberCount: campaign.members.length + 1, // +1 for owner
    entityCounts: entityTypeCounts,
    recentEntities: recentEntitiesResult,
    recentDocuments: recentDocumentsResult.map((doc) => ({
      id: doc.id,
      name: doc.name,
      fileType: doc.fileType,
      createdAt: doc.createdAt,
      uploadedBy: {
        name: doc.uploader?.name,
      },
    })),
  })
}
