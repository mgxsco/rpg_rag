import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, campaignInvites } from '@/lib/db'
import { eq, and, or, gt, isNull } from 'drizzle-orm'
import { ensureCampaignInvitesTable } from '@/lib/db/migrations'

// Generate a random 8-character invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Removed confusing chars (0, O, I, 1)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// GET /api/campaigns/[campaignId]/invites - List all active invites
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
    return NextResponse.json({ error: 'Only DMs can view invites' }, { status: 403 })
  }

  // Ensure table exists
  await ensureCampaignInvitesTable()

  // Get active invites (not expired and has uses remaining)
  const invites = await db.query.campaignInvites.findMany({
    where: and(
      eq(campaignInvites.campaignId, params.campaignId),
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
      creator: true,
    },
    orderBy: (invites, { desc }) => [desc(invites.createdAt)],
  })

  return NextResponse.json({
    invites: invites.map((invite) => ({
      id: invite.id,
      code: invite.code,
      role: invite.role,
      usesRemaining: invite.usesRemaining,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      createdBy: {
        id: invite.creator.id,
        name: invite.creator.name,
      },
    })),
  })
}

// POST /api/campaigns/[campaignId]/invites - Create a new invite
export async function POST(
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
    return NextResponse.json({ error: 'Only DMs can create invites' }, { status: 403 })
  }

  // Ensure table exists
  await ensureCampaignInvitesTable()

  const body = await request.json()
  const { role = 'player', usesLimit, expiresIn } = body

  // Validate role
  if (role !== 'player' && role !== 'viewer') {
    return NextResponse.json({ error: 'Invalid role. Must be player or viewer' }, { status: 400 })
  }

  // Calculate expiration date
  let expiresAt: Date | null = null
  if (expiresIn) {
    expiresAt = new Date()
    switch (expiresIn) {
      case '1d':
        expiresAt.setDate(expiresAt.getDate() + 1)
        break
      case '7d':
        expiresAt.setDate(expiresAt.getDate() + 7)
        break
      case '30d':
        expiresAt.setDate(expiresAt.getDate() + 30)
        break
      default:
        expiresAt = null
    }
  }

  // Generate unique code
  let code: string
  let attempts = 0
  do {
    code = generateInviteCode()
    const existing = await db.query.campaignInvites.findFirst({
      where: eq(campaignInvites.code, code),
    })
    if (!existing) break
    attempts++
  } while (attempts < 10)

  if (attempts >= 10) {
    return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 })
  }

  // Create invite
  const [invite] = await db
    .insert(campaignInvites)
    .values({
      campaignId: params.campaignId,
      code,
      role,
      usesRemaining: usesLimit || null,
      expiresAt,
      createdBy: session.user.id,
    })
    .returning()

  // Generate full invite URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || ''
  const inviteUrl = `${baseUrl}/invite/${code}`

  return NextResponse.json({
    invite: {
      id: invite.id,
      code: invite.code,
      role: invite.role,
      usesRemaining: invite.usesRemaining,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      url: inviteUrl,
    },
  })
}
