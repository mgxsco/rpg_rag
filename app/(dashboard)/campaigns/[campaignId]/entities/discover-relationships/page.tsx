import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, relationships } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { WikiRelationshipDiscovery } from '@/components/entities/wiki-relationship-discovery'

export default async function DiscoverRelationshipsPage({
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

  const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id

  if (!isDM) {
    redirect(`/campaigns/${campaignId}/entities`)
  }

  // Get counts for display
  const entityCount = await db
    .select()
    .from(entities)
    .where(eq(entities.campaignId, campaignId))
    .then(rows => rows.length)

  const relationshipCount = await db
    .select()
    .from(relationships)
    .where(eq(relationships.campaignId, campaignId))
    .then(rows => rows.length)

  return (
    <div className="flex flex-col md:flex-row gap-3 sm:gap-4 md:gap-5 max-w-full overflow-hidden">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-16 md:pb-0 overflow-x-hidden">
        <WikiRelationshipDiscovery
          campaignId={campaignId}
          entityCount={entityCount}
          existingRelationshipCount={relationshipCount}
        />
      </div>
    </div>
  )
}
