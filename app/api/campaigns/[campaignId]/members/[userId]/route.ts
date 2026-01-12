import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

// PUT /api/campaigns/[campaignId]/members/[userId] - Update member role (DM only)
export async function PUT(
  request: Request,
  { params }: { params: { campaignId: string; userId: string } }
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

  // Check if user is DM
  const isOwner = campaign.ownerId === session.user.id
  const isDM = isOwner || campaign.members.some(
    (m) => m.userId === session.user!.id && m.role === 'dm'
  )

  if (!isDM) {
    return NextResponse.json({ error: 'Only DMs can manage members' }, { status: 403 })
  }

  // Cannot modify the owner
  if (params.userId === campaign.ownerId) {
    return NextResponse.json({ error: 'Cannot modify the campaign owner' }, { status: 400 })
  }

  const body = await request.json()
  const { role } = body

  // Validate role
  if (!['dm', 'player', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Find the member
  const member = campaign.members.find((m) => m.userId === params.userId)
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // Update member role
  const [updated] = await db
    .update(campaignMembers)
    .set({ role })
    .where(
      and(
        eq(campaignMembers.campaignId, params.campaignId),
        eq(campaignMembers.userId, params.userId)
      )
    )
    .returning()

  return NextResponse.json({
    member: {
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
    },
  })
}

// DELETE /api/campaigns/[campaignId]/members/[userId] - Remove member (DM only)
export async function DELETE(
  request: Request,
  { params }: { params: { campaignId: string; userId: string } }
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

  // Check if user is DM
  const isOwner = campaign.ownerId === session.user.id
  const isDM = isOwner || campaign.members.some(
    (m) => m.userId === session.user!.id && m.role === 'dm'
  )

  if (!isDM) {
    return NextResponse.json({ error: 'Only DMs can remove members' }, { status: 403 })
  }

  // Cannot remove the owner
  if (params.userId === campaign.ownerId) {
    return NextResponse.json({ error: 'Cannot remove the campaign owner' }, { status: 400 })
  }

  // Delete the member
  const deleted = await db
    .delete(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, params.campaignId),
        eq(campaignMembers.userId, params.userId)
      )
    )
    .returning()

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
