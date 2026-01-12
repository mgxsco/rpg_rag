import { NextResponse } from 'next/server'
import { db, campaignInvites, campaigns } from '@/lib/db'
import { eq, and, or, gt, isNull } from 'drizzle-orm'
import { ensureCampaignInvitesTable } from '@/lib/db/migrations'

// GET /api/invites/[code] - Get invite info (public, for preview)
export async function GET(
  request: Request,
  { params }: { params: { code: string } }
) {
  // Ensure table exists
  await ensureCampaignInvitesTable()

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
      campaign: {
        with: {
          owner: true,
        },
      },
    },
  })

  if (!invite) {
    return NextResponse.json(
      { error: 'Invite not found or has expired' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    invite: {
      code: invite.code,
      role: invite.role,
      expiresAt: invite.expiresAt,
      campaign: {
        id: invite.campaign.id,
        name: invite.campaign.name,
        description: invite.campaign.description,
        owner: {
          name: invite.campaign.owner.name,
        },
      },
    },
  })
}
