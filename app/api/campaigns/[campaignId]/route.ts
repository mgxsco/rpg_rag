import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, users } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

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
      owner: true,
      members: {
        with: {
          user: true,
        },
      },
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

  const userRole = campaign.members.find((m) => m.userId === session.user!.id)?.role
  const isDM = userRole === 'dm' || isOwner

  return NextResponse.json({
    ...campaign,
    isDM,
    userRole: isDM ? 'dm' : userRole || 'viewer',
  })
}

export async function PUT(
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

  if (campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can edit' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, language } = body

  const updateData: Record<string, any> = {
    name,
    description,
    updatedAt: new Date(),
  }

  if (language) {
    updateData.language = language
  }

  const [updated] = await db
    .update(campaigns)
    .set(updateData)
    .where(eq(campaigns.id, params.campaignId))
    .returning()

  return NextResponse.json(updated)
}

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

  if (campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can delete' }, { status: 403 })
  }

  await db.delete(campaigns).where(eq(campaigns.id, params.campaignId))

  return NextResponse.json({ success: true })
}
