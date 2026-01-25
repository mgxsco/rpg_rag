import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, or } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { NpcRelationships } from '@/components/player/npc-relationships'
import { Heart } from 'lucide-react'

export default async function MyRelationshipsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params

  const session = await getSession()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    redirect('/campaigns')
  }

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  if (!membership && campaign.ownerId !== session.user.id) {
    redirect('/campaigns')
  }

  const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id

  // Get player characters
  // For DMs: show all player characters
  // For players: show characters assigned to them
  let characters = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'player_character')
    ),
  })

  // Filter to only characters the player owns (unless they're DM)
  if (!isDM && membership) {
    characters = characters.filter((c) => c.playerId === membership.id)
  }

  // Filter DM-only for non-DMs
  if (!isDM) {
    characters = characters.filter((c) => !c.isDmOnly)
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6" />
            {isDM ? 'Character Relationships' : 'My Relationships'}
          </h1>
          <p className="text-muted-foreground">
            {isDM
              ? 'View relationships for any player character'
              : 'See who your character knows, loves, and hates'}
          </p>
        </div>

        <NpcRelationships
          campaignId={campaignId}
          characters={characters}
          isDM={isDM}
        />
      </div>
    </div>
  )
}
