import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { KnowledgeManager } from '@/components/player/knowledge-manager'
import { Brain } from 'lucide-react'

export default async function KnowledgePage({
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

  // Only DMs can access this page
  if (!isDM) {
    redirect(`/campaigns/${campaignId}`)
  }

  // Get player characters
  const characters = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'player_character')
    ),
    orderBy: [desc(entities.name)],
  })

  // Get sessions
  const sessions = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'session')
    ),
    orderBy: [desc(entities.sessionNumber)],
  })

  // Get all entities (excluding player characters, sessions, and journal entries)
  const allEntities = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    orderBy: [desc(entities.updatedAt)],
  })

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            Knowledge Manager
          </h1>
          <p className="text-muted-foreground">
            Track what each player character knows about entities in your campaign
          </p>
        </div>

        <KnowledgeManager
          campaignId={campaignId}
          characters={characters}
          sessions={sessions}
          allEntities={allEntities}
        />
      </div>
    </div>
  )
}
