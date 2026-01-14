import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, users } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

// GET /api/campaigns/[campaignId]/members - List all members
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
      owner: {
        columns: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      members: {
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Check if user is a member
  const isMember = campaign.members.some((m) => m.userId === session.user!.id)
  const isOwner = campaign.ownerId === session.user.id

  if (!isMember && !isOwner) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Format members list (owner already loaded via eager loading)
  const members = campaign.members.map((m) => ({
    id: m.id,
    memberId: m.id, // For reference in player character linking
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
    user: m.user,
    isOwner: m.userId === campaign.ownerId,
  }))

  // Add owner if not in members list
  const ownerInMembers = members.find((m) => m.userId === campaign.ownerId)
  if (!ownerInMembers && campaign.owner) {
    members.unshift({
      id: campaign.ownerId, // Use owner's user ID as a placeholder
      memberId: null as any, // Owner might not have a campaign_members entry
      userId: campaign.ownerId,
      role: 'dm',
      joinedAt: campaign.createdAt,
      user: campaign.owner,
      isOwner: true,
    })
  }

  return NextResponse.json({
    members,
    totalCount: members.length,
  })
}
