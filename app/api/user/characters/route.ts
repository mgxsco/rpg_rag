import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, inArray } from 'drizzle-orm'

// GET - Get all campaigns with player characters for the current user
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all campaigns where user is a member
    const memberships = await db.query.campaignMembers.findMany({
      where: eq(campaignMembers.userId, session.user.id),
      with: {
        campaign: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Also get campaigns where user is owner but not a member
    const ownedCampaigns = await db.query.campaigns.findMany({
      where: eq(campaigns.ownerId, session.user.id),
      columns: {
        id: true,
        name: true,
      },
    })

    // Merge and dedupe campaigns
    const campaignMap = new Map<string, { id: string; name: string; membershipId: string | null }>()

    for (const m of memberships) {
      campaignMap.set(m.campaign.id, {
        id: m.campaign.id,
        name: m.campaign.name,
        membershipId: m.id,
      })
    }

    for (const c of ownedCampaigns) {
      if (!campaignMap.has(c.id)) {
        // Owner without membership - need to find or create membership
        const membership = await db.query.campaignMembers.findFirst({
          where: and(
            eq(campaignMembers.campaignId, c.id),
            eq(campaignMembers.userId, session.user.id)
          ),
        })
        campaignMap.set(c.id, {
          id: c.id,
          name: c.name,
          membershipId: membership?.id || null,
        })
      }
    }

    const campaignIds = Array.from(campaignMap.keys())

    if (campaignIds.length === 0) {
      return NextResponse.json({ campaigns: [] })
    }

    // Get all player_character entities from these campaigns
    const playerCharacters = await db.query.entities.findMany({
      where: and(
        inArray(entities.campaignId, campaignIds),
        eq(entities.entityType, 'player_character')
      ),
      columns: {
        id: true,
        name: true,
        campaignId: true,
        playerId: true,
        isDmOnly: true,
      },
      with: {
        player: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Build response with campaigns and their characters
    const result = Array.from(campaignMap.values()).map((campaign) => {
      const characters = playerCharacters
        .filter((pc) => pc.campaignId === campaign.id)
        .map((pc) => ({
          id: pc.id,
          name: pc.name,
          playerId: pc.playerId,
          isMine: pc.playerId === campaign.membershipId,
          assignedTo: pc.player
            ? {
                id: pc.player.id,
                name: pc.player.user.name,
                email: pc.player.user.email,
              }
            : null,
        }))

      return {
        id: campaign.id,
        name: campaign.name,
        membershipId: campaign.membershipId,
        characters,
      }
    })

    return NextResponse.json({ campaigns: result })
  } catch (error) {
    console.error('[User Characters GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch characters' },
      { status: 500 }
    )
  }
}

// PUT - Update character assignments for the current user
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { campaignId, characterIds } = body

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })
    }

    if (!Array.isArray(characterIds)) {
      return NextResponse.json({ error: 'Character IDs must be an array' }, { status: 400 })
    }

    // Get user's membership in this campaign
    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    // Check if user is campaign owner
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const isOwner = campaign.ownerId === session.user.id

    if (!membership && !isOwner) {
      return NextResponse.json(
        { error: 'Not a member of this campaign' },
        { status: 403 }
      )
    }

    const membershipId = membership?.id

    if (!membershipId) {
      return NextResponse.json(
        { error: 'No membership found for character assignment' },
        { status: 400 }
      )
    }

    // Get all player_character entities in this campaign
    const allCharacters = await db.query.entities.findMany({
      where: and(
        eq(entities.campaignId, campaignId),
        eq(entities.entityType, 'player_character')
      ),
      columns: {
        id: true,
        playerId: true,
      },
    })

    // Update characters:
    // 1. Set playerId to membershipId for characters in characterIds
    // 2. Set playerId to null for characters currently assigned to this member but not in characterIds

    for (const char of allCharacters) {
      const shouldBeAssigned = characterIds.includes(char.id)
      const isCurrentlyMine = char.playerId === membershipId

      if (shouldBeAssigned && !isCurrentlyMine) {
        // Assign to me (only if not already assigned to someone else)
        if (!char.playerId) {
          await db
            .update(entities)
            .set({ playerId: membershipId, updatedAt: new Date() })
            .where(eq(entities.id, char.id))
        }
      } else if (!shouldBeAssigned && isCurrentlyMine) {
        // Unassign from me
        await db
          .update(entities)
          .set({ playerId: null, updatedAt: new Date() })
          .where(eq(entities.id, char.id))
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[User Characters PUT] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update characters' },
      { status: 500 }
    )
  }
}
