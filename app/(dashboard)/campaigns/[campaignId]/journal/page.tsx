import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { Journal } from '@/components/player/journal'
import { BookMarked } from 'lucide-react'

export default async function JournalPage({
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

  // Get or create a membership ID for journal entries
  // For DMs who are campaign owners without explicit membership, use their user ID as a pseudo-member ID
  const memberId = membership?.id || session.user.id

  // Get journal entries for this user
  const journalEntries = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.entityType, 'journal_entry'),
      eq(entities.playerId, memberId)
    ),
    orderBy: (entities, { desc }) => [desc(entities.updatedAt)],
  })

  // Get all entities for wikilink resolution
  const allEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.isDmOnly, false)
    ),
    columns: { id: true, name: true },
  })

  const entityMap = new Map<string, string>()
  allEntities.forEach((e) => {
    entityMap.set(e.name.toLowerCase(), e.id)
  })

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookMarked className="h-6 w-6" />
            My Journal
          </h1>
          <p className="text-muted-foreground">
            Personal notes and thoughts - only you and the DM can see these
          </p>
        </div>

        <Journal
          campaignId={campaignId}
          memberId={memberId}
          entries={journalEntries}
          entityMap={entityMap}
        />
      </div>
    </div>
  )
}
