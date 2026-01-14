import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { DocumentUploadWithReview } from '@/components/entities/document-upload-with-review'

export default async function UploadPage({
  params,
}: {
  params: { campaignId: string }
}) {
  const session = await getSession()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const isDM = membership?.role === 'dm' || campaign?.ownerId === session.user.id

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />
      <div className="flex-1 min-w-0">
        <DocumentUploadWithReview campaignId={params.campaignId} />
      </div>
    </div>
  )
}
