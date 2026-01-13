import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, entities, entityComments, campaignMembers, campaigns, users } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'

// GET comments for an entity
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entityId } = await params

    // Get the entity to check campaign access
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    })

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Check campaign membership
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, entity.campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, entity.campaignId),
    })

    const isOwner = campaign?.ownerId === session.user.id
    if (!membership && !isOwner) {
      return NextResponse.json({ error: 'Not a member of this campaign' }, { status: 403 })
    }

    // Check DM-only access
    const isDM = membership?.role === 'dm' || isOwner
    if (entity.isDmOnly && !isDM) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Fetch comments with user info
    const comments = await db.query.entityComments.findMany({
      where: eq(entityComments.entityId, entityId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: [desc(entityComments.createdAt)],
    })

    return NextResponse.json({
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        user: {
          id: c.user.id,
          name: c.user.name,
          image: c.user.image,
        },
      })),
    })
  } catch (error) {
    console.error('[Entity Comments GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    )
  }
}

// POST a new comment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entityId } = await params
    const body = await request.json()
    const { content } = body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: 'Comment too long (max 2000 characters)' }, { status: 400 })
    }

    // Get the entity to check campaign access
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    })

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Check campaign membership
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, entity.campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, entity.campaignId),
    })

    const isOwner = campaign?.ownerId === session.user.id
    if (!membership && !isOwner) {
      return NextResponse.json({ error: 'Not a member of this campaign' }, { status: 403 })
    }

    // Check DM-only access
    const isDM = membership?.role === 'dm' || isOwner
    if (entity.isDmOnly && !isDM) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Insert the comment
    const [newComment] = await db.insert(entityComments).values({
      entityId,
      userId: session.user.id,
      content: content.trim(),
    }).returning()

    // Fetch user info for the response
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        id: true,
        name: true,
        image: true,
      },
    })

    return NextResponse.json({
      id: newComment.id,
      content: newComment.content,
      createdAt: newComment.createdAt.toISOString(),
      updatedAt: newComment.updatedAt.toISOString(),
      user: {
        id: user?.id || session.user.id,
        name: user?.name || 'Unknown',
        image: user?.image || null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[Entity Comments POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to post comment' },
      { status: 500 }
    )
  }
}

// DELETE a comment
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entityId } = await params
    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get('commentId')

    if (!commentId) {
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 })
    }

    // Get the comment
    const comment = await db.query.entityComments.findFirst({
      where: and(
        eq(entityComments.id, commentId),
        eq(entityComments.entityId, entityId)
      ),
    })

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    // Get the entity to check campaign access
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    })

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Check campaign membership and permissions
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, entity.campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, entity.campaignId),
    })

    const isOwner = campaign?.ownerId === session.user.id
    const isDM = membership?.role === 'dm' || isOwner
    const isCommentAuthor = comment.userId === session.user.id

    // Only allow deletion if user is DM/owner or the comment author
    if (!isDM && !isCommentAuthor) {
      return NextResponse.json({ error: 'Cannot delete this comment' }, { status: 403 })
    }

    // Delete the comment
    await db.delete(entityComments).where(eq(entityComments.id, commentId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Entity Comments DELETE] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    )
  }
}
