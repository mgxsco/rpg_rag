import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, messages } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'

// GET message history for a campaign
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    // Check campaign membership
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    // Also check if user is owner
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const isOwner = campaign.ownerId === session.user.id
    if (!membership && !isOwner) {
      return NextResponse.json({ error: 'Not a member of this campaign' }, { status: 403 })
    }

    // Fetch messages with user info
    const messageList = await db.query.messages.findMany({
      where: eq(messages.campaignId, campaignId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: [desc(messages.createdAt)],
      limit,
    })

    // Reverse to get chronological order (oldest first in the batch)
    const chronologicalMessages = messageList.reverse()

    return NextResponse.json({
      messages: chronologicalMessages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        messageType: msg.messageType,
        characterName: msg.characterName,
        createdAt: msg.createdAt.toISOString(),
        user: {
          id: msg.user.id,
          name: msg.user.name,
          image: msg.user.image,
        },
      })),
    })
  } catch (error) {
    console.error('[Messages GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}

// POST a new message
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const body = await request.json()
    const { content, messageType = 'ooc', characterName } = body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    // Validate message type
    if (!['ooc', 'ic', 'system'].includes(messageType)) {
      return NextResponse.json({ error: 'Invalid message type' }, { status: 400 })
    }

    // Check campaign membership
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    // Also check if user is owner
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const isOwner = campaign.ownerId === session.user.id
    if (!membership && !isOwner) {
      return NextResponse.json({ error: 'Not a member of this campaign' }, { status: 403 })
    }

    // Insert the message
    // Supabase Realtime will automatically broadcast the INSERT to subscribers
    const [newMessage] = await db.insert(messages).values({
      campaignId,
      userId: session.user.id,
      content: content.trim(),
      messageType,
      characterName: messageType === 'ic' ? characterName || null : null,
    }).returning()

    // Use session.user directly (already has id, name, image from JWT)
    const messagePayload = {
      id: newMessage.id,
      content: newMessage.content,
      messageType: newMessage.messageType,
      characterName: newMessage.characterName,
      createdAt: newMessage.createdAt.toISOString(),
      user: {
        id: session.user.id,
        name: session.user.name || 'Unknown',
        image: session.user.image || null,
      },
    }

    return NextResponse.json(messagePayload, { status: 201 })
  } catch (error) {
    console.error('[Messages POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
