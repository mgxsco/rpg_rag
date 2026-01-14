import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { SessionTimeline } from '@/components/sessions/session-timeline'
import { Plus, CalendarDays, Filter } from 'lucide-react'
import { Entity } from '@/lib/db/schema'

export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { campaignId } = await params
  const { status = 'all' } = await searchParams

  const session = await getSession()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const isDM = membership?.role === 'dm' || campaign?.ownerId === session.user.id

  // Get all sessions
  let allSessions: Entity[] = []

  try {
    allSessions = await db.query.entities.findMany({
      where: and(
        eq(entities.campaignId, campaignId),
        eq(entities.entityType, 'session')
      ),
    })
  } catch (error) {
    console.error('[Sessions] Error fetching sessions:', error)
  }

  // Filter by DM-only if not DM
  if (!isDM) {
    allSessions = allSessions.filter((s) => !s.isDmOnly)
  }

  // Filter by status
  if (status && status !== 'all') {
    allSessions = allSessions.filter((s) => s.sessionStatus === status)
  }

  // Sort by session number (descending - newest first)
  allSessions.sort((a, b) => {
    const numA = a.sessionNumber ?? 0
    const numB = b.sessionNumber ?? 0
    return numB - numA
  })

  // Stats
  const completedCount = allSessions.filter((s) => s.sessionStatus === 'completed').length
  const plannedCount = allSessions.filter((s) => s.sessionStatus === 'planned').length

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-6 w-6" />
              Sessions
            </h1>
            <p className="text-muted-foreground">
              {completedCount} completed, {plannedCount} planned
            </p>
          </div>
          {isDM && (
            <Link href={`/campaigns/${campaignId}/sessions/new`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </Link>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link href={`/campaigns/${campaignId}/sessions`}>
            <Badge
              variant={status === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
            >
              All
            </Badge>
          </Link>
          <Link href={`/campaigns/${campaignId}/sessions?status=completed`}>
            <Badge
              variant={status === 'completed' ? 'default' : 'outline'}
              className="cursor-pointer"
            >
              Completed
            </Badge>
          </Link>
          <Link href={`/campaigns/${campaignId}/sessions?status=planned`}>
            <Badge
              variant={status === 'planned' ? 'default' : 'outline'}
              className="cursor-pointer"
            >
              Planned
            </Badge>
          </Link>
          <Link href={`/campaigns/${campaignId}/sessions?status=cancelled`}>
            <Badge
              variant={status === 'cancelled' ? 'default' : 'outline'}
              className="cursor-pointer"
            >
              Cancelled
            </Badge>
          </Link>
        </div>

        {/* Content */}
        {allSessions.length > 0 ? (
          <SessionTimeline sessions={allSessions} campaignId={campaignId} />
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No sessions yet</h3>
            <p className="mb-4">
              {status !== 'all'
                ? 'No sessions match this filter'
                : 'Create your first session to start tracking your campaign'}
            </p>
            {isDM && status === 'all' && (
              <Link href={`/campaigns/${campaignId}/sessions/new`}>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Session
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
