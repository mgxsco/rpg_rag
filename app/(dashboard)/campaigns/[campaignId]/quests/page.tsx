import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { QuestTracker } from '@/components/player/quest-tracker'
import { Button } from '@/components/ui/button'
import { Swords, Plus } from 'lucide-react'

export default async function QuestsPage({
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

  // Get all quests
  let quests = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'quest')
    ),
    orderBy: (entities, { desc }) => [desc(entities.updatedAt)],
  })

  // Filter DM-only quests for non-DMs
  if (!isDM) {
    quests = quests.filter((q) => !q.isDmOnly)
  }

  // Calculate stats
  const stats = {
    active: quests.filter((q) => q.questStatus === 'active' || !q.questStatus).length,
    completed: quests.filter((q) => q.questStatus === 'completed').length,
    failed: quests.filter((q) => q.questStatus === 'failed').length,
    abandoned: quests.filter((q) => q.questStatus === 'abandoned').length,
    total: quests.length,
  }

  // Get all entities for wikilink resolution
  const allEntities = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    columns: { id: true, name: true, isDmOnly: true },
  })

  const entityMap = new Map<string, string>()
  allEntities
    .filter((e) => isDM || !e.isDmOnly)
    .forEach((e) => {
      entityMap.set(e.name.toLowerCase(), e.id)
    })

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Swords className="h-6 w-6" />
              {isDM ? 'Quest Manager' : 'Quests'}
            </h1>
            <p className="text-muted-foreground">
              {isDM
                ? 'Manage campaign quests and track progress'
                : 'Track your party\'s active and completed quests'}
            </p>
          </div>
          {isDM && (
            <Link href={`/campaigns/${campaignId}/entities?type=quest`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Quest
              </Button>
            </Link>
          )}
        </div>

        <QuestTracker
          campaignId={campaignId}
          quests={quests}
          stats={stats}
          isDM={isDM}
          entityMap={entityMap}
        />
      </div>
    </div>
  )
}
