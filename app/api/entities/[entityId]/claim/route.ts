import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, entities, campaignMembers, campaigns } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

// POST - Claim or assign a player character
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entityId } = await params
    const body = await request.json().catch(() => ({}))
    const { memberId } = body // Optional: DM can specify which member to assign

    // Get the entity
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    })

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Must be a player_character type
    if (entity.entityType !== 'player_character') {
      return NextResponse.json(
        { error: 'Only player characters can be claimed' },
        { status: 400 }
      )
    }

    // Get campaign and membership info
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, entity.campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const userMembership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, entity.campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    const isOwner = campaign.ownerId === session.user.id
    const isDM = userMembership?.role === 'dm' || isOwner

    if (!userMembership && !isOwner) {
      return NextResponse.json(
        { error: 'Not a member of this campaign' },
        { status: 403 }
      )
    }

    let targetMemberId: string

    if (memberId) {
      // DM is assigning to a specific member
      if (!isDM) {
        return NextResponse.json(
          { error: 'Only DMs can assign characters to other members' },
          { status: 403 }
        )
      }

      // Verify the target member exists in the campaign
      const targetMember = await db.query.campaignMembers.findFirst({
        where: and(
          eq(campaignMembers.id, memberId),
          eq(campaignMembers.campaignId, entity.campaignId)
        ),
      })

      if (!targetMember) {
        return NextResponse.json(
          { error: 'Target member not found in this campaign' },
          { status: 404 }
        )
      }

      targetMemberId = memberId
    } else {
      // Player is claiming for themselves
      if (!userMembership) {
        return NextResponse.json(
          { error: 'You must be a campaign member to claim a character' },
          { status: 403 }
        )
      }

      // Check if character is already claimed by someone else
      if (entity.playerId && entity.playerId !== userMembership.id) {
        if (!isDM) {
          return NextResponse.json(
            { error: 'This character is already claimed by another player' },
            { status: 400 }
          )
        }
      }

      targetMemberId = userMembership.id
    }

    // Update the entity with the player assignment
    const [updated] = await db
      .update(entities)
      .set({
        playerId: targetMemberId,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entityId))
      .returning()

    // Get the member info for the response
    const member = await db.query.campaignMembers.findFirst({
      where: eq(campaignMembers.id, targetMemberId),
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
    })

    return NextResponse.json({
      success: true,
      entity: {
        id: updated.id,
        name: updated.name,
        playerId: updated.playerId,
      },
      player: member
        ? {
            id: member.id,
            userId: member.userId,
            name: member.user.name,
            email: member.user.email,
            image: member.user.image,
          }
        : null,
    })
  } catch (error) {
    console.error('[Claim Character] Error:', error)
    return NextResponse.json(
      { error: 'Failed to claim character' },
      { status: 500 }
    )
  }
}

// DELETE - Unclaim/unassign a player character
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entityId } = await params

    // Get the entity
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    })

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    if (entity.entityType !== 'player_character') {
      return NextResponse.json(
        { error: 'Only player characters can be unclaimed' },
        { status: 400 }
      )
    }

    // Get campaign and membership info
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, entity.campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const userMembership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, entity.campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    const isOwner = campaign.ownerId === session.user.id
    const isDM = userMembership?.role === 'dm' || isOwner

    // Only the assigned player or a DM can unclaim
    const isAssignedPlayer = entity.playerId === userMembership?.id

    if (!isDM && !isAssignedPlayer) {
      return NextResponse.json(
        { error: 'You can only unclaim your own character' },
        { status: 403 }
      )
    }

    // Remove the player assignment
    await db
      .update(entities)
      .set({
        playerId: null,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entityId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Unclaim Character] Error:', error)
    return NextResponse.json(
      { error: 'Failed to unclaim character' },
      { status: 500 }
    )
  }
}
