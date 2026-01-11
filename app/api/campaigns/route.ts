import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, or } from 'drizzle-orm'

export async function GET() {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get campaigns where user is owner or member
  const userCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      description: campaigns.description,
      ownerId: campaigns.ownerId,
      createdAt: campaigns.createdAt,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .leftJoin(campaignMembers, eq(campaigns.id, campaignMembers.campaignId))
    .where(
      or(
        eq(campaigns.ownerId, session.user.id),
        eq(campaignMembers.userId, session.user.id)
      )
    )

  // Remove duplicates
  const uniqueCampaigns = Array.from(
    new Map(userCampaigns.map((c) => [c.id, c])).values()
  )

  return NextResponse.json(uniqueCampaigns)
}

export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, description } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // Create campaign
  const [campaign] = await db
    .insert(campaigns)
    .values({
      name,
      description,
      ownerId: session.user.id,
    })
    .returning()

  // Add owner as DM
  await db.insert(campaignMembers).values({
    campaignId: campaign.id,
    userId: session.user.id,
    role: 'dm',
  })

  return NextResponse.json(campaign)
}
