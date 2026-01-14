import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaignInvites, campaignMembers, users } from '@/lib/db'
import { eq, and, or, gt, isNull } from 'drizzle-orm'
import { ensureCampaignInvitesTable, ensureCampaignMembersJoinedAt } from '@/lib/db/migrations'

// POST /api/invites/[code]/join - Join a campaign using an invite code
export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please log in to join a campaign' }, { status: 401 })
  }

  // Verify user exists in database
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  })

  if (!user) {
    return NextResponse.json(
      { error: 'User account not found. Please log out and register again.' },
      { status: 400 }
    )
  }

  // Ensure tables exist
  await ensureCampaignInvitesTable()
  await ensureCampaignMembersJoinedAt()

  // Find valid invite
  const invite = await db.query.campaignInvites.findFirst({
    where: and(
      eq(campaignInvites.code, params.code.toUpperCase()),
      or(
        isNull(campaignInvites.expiresAt),
        gt(campaignInvites.expiresAt, new Date())
      ),
      or(
        isNull(campaignInvites.usesRemaining),
        gt(campaignInvites.usesRemaining, 0)
      )
    ),
    with: {
      campaign: true,
    },
  })

  if (!invite) {
    return NextResponse.json(
      { error: 'Invite not found or has expired' },
      { status: 404 }
    )
  }

  // Check if user is already a member
  const existingMember = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, invite.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  if (existingMember) {
    return NextResponse.json({
      success: true,
      alreadyMember: true,
      campaign: {
        id: invite.campaign.id,
        name: invite.campaign.name,
      },
    })
  }

  // Check if user is the owner (they shouldn't need to join)
  if (invite.campaign.ownerId === session.user.id) {
    return NextResponse.json({
      success: true,
      alreadyMember: true,
      campaign: {
        id: invite.campaign.id,
        name: invite.campaign.name,
      },
    })
  }

  // Add user as member
  await db.insert(campaignMembers).values({
    campaignId: invite.campaignId,
    userId: session.user.id,
    role: invite.role,
  })

  // Decrement uses remaining if not unlimited
  if (invite.usesRemaining !== null) {
    await db
      .update(campaignInvites)
      .set({ usesRemaining: invite.usesRemaining - 1 })
      .where(eq(campaignInvites.id, invite.id))
  }

  return NextResponse.json({
    success: true,
    campaign: {
      id: invite.campaign.id,
      name: invite.campaign.name,
    },
    role: invite.role,
  })
}
