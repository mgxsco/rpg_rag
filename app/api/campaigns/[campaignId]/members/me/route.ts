import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

// DELETE /api/campaigns/[campaignId]/members/me - Leave campaign (self)
export async function DELETE(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Cannot leave if you're the owner
  if (campaign.ownerId === session.user.id) {
    return NextResponse.json(
      { error: 'Campaign owner cannot leave. Transfer ownership or delete the campaign.' },
      { status: 400 }
    )
  }

  // Delete the member
  const deleted = await db
    .delete(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, params.campaignId),
        eq(campaignMembers.userId, session.user.id)
      )
    )
    .returning()

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'You are not a member of this campaign' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
