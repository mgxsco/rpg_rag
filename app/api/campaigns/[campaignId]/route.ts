import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, users } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { validatePublicSlug, isSlugAvailable } from '@/lib/api/public-access'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
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
    currentUserId: session.user.id,
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can edit' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, language, settings, isPublic, publicSlug } = body

  const updateData: Record<string, any> = {
    name,
    description,
    updatedAt: new Date(),
  }

  if (language) {
    updateData.language = language
  }

  if (settings !== undefined) {
    updateData.settings = settings
  }

  // Handle public sharing settings
  if (isPublic !== undefined) {
    updateData.isPublic = isPublic

    if (isPublic && publicSlug) {
      // Validate slug format
      const slugError = validatePublicSlug(publicSlug)
      if (slugError) {
        return NextResponse.json({ error: slugError }, { status: 400 })
      }

      // Check slug availability (excluding current campaign)
      const available = await isSlugAvailable(publicSlug, campaignId)
      if (!available) {
        return NextResponse.json(
          { error: 'This slug is already taken by another campaign' },
          { status: 400 }
        )
      }

      updateData.publicSlug = publicSlug
    } else if (!isPublic) {
      // Clear slug when making private
      updateData.publicSlug = null
    }
  }

  const [updated] = await db
    .update(campaigns)
    .set(updateData)
    .where(eq(campaigns.id, campaignId))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can delete' }, { status: 403 })
  }

  await db.delete(campaigns).where(eq(campaigns.id, campaignId))

  return NextResponse.json({ success: true })
}
