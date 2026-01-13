import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, entities, documents, campaignMembers } from '@/lib/db'
import { eq, desc, and, gte, sql } from 'drizzle-orm'

interface Activity {
  type: 'entity_created' | 'entity_updated' | 'document_uploaded' | 'session_added' | 'member_joined'
  entityId?: string
  entityName?: string
  entityType?: string
  documentId?: string
  documentName?: string
  userId?: string
  userName?: string
  userImage?: string | null
  timestamp: string
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    // Check membership
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get recent activity from multiple sources
    const activities: Activity[] = []

    // Get recent entities (both created and updated)
    const recentEntities = await db.query.entities.findMany({
      where: eq(entities.campaignId, campaignId),
      orderBy: [desc(entities.updatedAt)],
      limit: limit * 2, // Get more to filter
    })

    // Determine if entity was created or updated based on timestamps
    for (const entity of recentEntities) {
      const createdTime = new Date(entity.createdAt).getTime()
      const updatedTime = new Date(entity.updatedAt).getTime()
      const timeDiff = updatedTime - createdTime

      // If created and updated within 1 minute, consider it as "created"
      // Otherwise, if updated significantly after creation, it's an "update"
      if (timeDiff < 60000) {
        activities.push({
          type: entity.entityType === 'session' ? 'session_added' : 'entity_created',
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.entityType,
          timestamp: entity.createdAt.toISOString(),
        })
      } else {
        // Add update activity if significantly after creation
        activities.push({
          type: 'entity_updated',
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.entityType,
          timestamp: entity.updatedAt.toISOString(),
        })
      }
    }

    // Get recent documents
    const recentDocuments = await db.query.documents.findMany({
      where: eq(documents.campaignId, campaignId),
      with: {
        uploader: true,
      },
      orderBy: [desc(documents.createdAt)],
      limit: limit,
    })

    for (const doc of recentDocuments) {
      activities.push({
        type: 'document_uploaded',
        documentId: doc.id,
        documentName: doc.name,
        userId: doc.uploadedBy,
        userName: doc.uploader?.name || 'Unknown',
        userImage: doc.uploader?.image || null,
        timestamp: doc.createdAt.toISOString(),
      })
    }

    // Get recent members
    const recentMembers = await db.query.campaignMembers.findMany({
      where: eq(campaignMembers.campaignId, campaignId),
      with: {
        user: true,
      },
      orderBy: [desc(campaignMembers.joinedAt)],
      limit: 10,
    })

    for (const member of recentMembers) {
      activities.push({
        type: 'member_joined',
        userId: member.userId,
        userName: member.user?.name || 'Unknown',
        userImage: member.user?.image || null,
        timestamp: member.joinedAt.toISOString(),
      })
    }

    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // Deduplicate consecutive entries for the same entity
    const deduped: Activity[] = []
    const seen = new Set<string>()

    for (const activity of activities) {
      const key = activity.entityId
        ? `${activity.entityId}-${activity.type}`
        : activity.documentId
        ? `${activity.documentId}-${activity.type}`
        : `${activity.userId}-${activity.type}`

      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(activity)
      }
    }

    return NextResponse.json({
      activities: deduped.slice(0, limit),
    })
  } catch (error) {
    console.error('[Activity] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    )
  }
}
