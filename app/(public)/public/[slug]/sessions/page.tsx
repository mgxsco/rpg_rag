import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, campaigns, entities } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, Filter } from 'lucide-react'

interface PublicSessionsPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function PublicSessionsPage({
  params,
  searchParams,
}: PublicSessionsPageProps) {
  const { slug } = await params
  const { status = 'all' } = await searchParams

  // Get campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.publicSlug, slug),
    columns: {
      id: true,
      name: true,
      isPublic: true,
    },
  })

  if (!campaign || !campaign.isPublic) {
    notFound()
  }

  // Get all public sessions
  let allSessions = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.entityType, 'session'),
      eq(entities.isDmOnly, false)
    ),
  })

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
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Sessions
        </h1>
        <p className="text-muted-foreground">
          {completedCount} completed, {plannedCount} planned
        </p>
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link href={`/public/${slug}/sessions`}>
          <Badge
            variant={status === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
          >
            All
          </Badge>
        </Link>
        <Link href={`/public/${slug}/sessions?status=completed`}>
          <Badge
            variant={status === 'completed' ? 'default' : 'outline'}
            className="cursor-pointer"
          >
            Completed
          </Badge>
        </Link>
        <Link href={`/public/${slug}/sessions?status=planned`}>
          <Badge
            variant={status === 'planned' ? 'default' : 'outline'}
            className="cursor-pointer"
          >
            Planned
          </Badge>
        </Link>
      </div>

      {/* Content */}
      {allSessions.length > 0 ? (
        <div className="space-y-4">
          {allSessions.map((session) => (
            <Link
              key={session.id}
              href={`/public/${slug}/entities/${session.id}`}
            >
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {session.sessionNumber && (
                          <Badge variant="outline">#{session.sessionNumber}</Badge>
                        )}
                        {session.sessionStatus && (
                          <Badge
                            variant={
                              session.sessionStatus === 'completed'
                                ? 'default'
                                : session.sessionStatus === 'planned'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {session.sessionStatus}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg">{session.name}</h3>
                    </div>
                    <div className="text-sm text-muted-foreground text-right">
                      {session.sessionDate && (
                        <p>{new Date(session.sessionDate).toLocaleDateString()}</p>
                      )}
                      {session.inGameDate && (
                        <p className="text-xs">In-game: {session.inGameDate}</p>
                      )}
                    </div>
                  </div>
                  {session.content && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {session.content.slice(0, 200)}
                      {session.content.length > 200 && '...'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No sessions yet</h3>
          <p>
            {status !== 'all'
              ? 'No sessions match this filter'
              : 'This campaign has no public sessions yet'}
          </p>
        </div>
      )}
    </div>
  )
}
