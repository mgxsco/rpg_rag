import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignInvites } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

// DELETE /api/campaigns/[campaignId]/invites/[code] - Revoke an invite
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ campaignId: string; code: string }> }
) {
  const { campaignId, code } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
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
    return NextResponse.json({ error: 'Only DMs can revoke invites' }, { status: 403 })
  }

  // Delete the invite
  const deleted = await db
    .delete(campaignInvites)
    .where(
      and(
        eq(campaignInvites.campaignId, campaignId),
        eq(campaignInvites.code, code)
      )
    )
    .returning()

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
