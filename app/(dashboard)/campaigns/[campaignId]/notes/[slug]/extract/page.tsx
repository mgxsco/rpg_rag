import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { NoteExtractionWithReview } from '@/components/notes/note-extraction-with-review'

export default async function NoteExtractPage({
  params,
}: {
  params: { campaignId: string; slug: string }
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
    redirect(`/campaigns/${params.campaignId}/notes/${params.slug}`)
  }

  const note = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, params.slug)
    ),
  })

  if (!note) {
    notFound()
  }

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />
      <div className="flex-1 min-w-0">
        <NoteExtractionWithReview
          campaignId={params.campaignId}
          noteSlug={params.slug}
          noteTitle={note.title}
          noteContent={note.content || ''}
        />
      </div>
    </div>
  )
}
