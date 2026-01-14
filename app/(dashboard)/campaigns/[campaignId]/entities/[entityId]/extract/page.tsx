import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { EntityExtractionWithReview } from '@/components/entities/entity-extraction-with-review'

export default async function EntityExtractPage({
  params,
}: {
  params: { campaignId: string; entityId: string }
}) {
  const session = await getSession()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    notFound()
  }

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const isDM = membership?.role === 'dm' || campaign?.ownerId === session.user.id

  // Only DMs can extract entities
  if (!isDM) {
    redirect(`/campaigns/${params.campaignId}/entities/${params.entityId}`)
  }

  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.campaignId, params.campaignId),
      eq(entities.id, params.entityId)
    ),
  })

  if (!entity) {
    notFound()
  }

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />
      <div className="flex-1 min-w-0">
        <EntityExtractionWithReview
          campaignId={params.campaignId}
          entityId={params.entityId}
          entityName={entity.name}
          entityContent={entity.content || ''}
          entityType={entity.entityType}
        />
      </div>
    </div>
  )
}
