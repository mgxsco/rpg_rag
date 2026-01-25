import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, campaigns, entities, relationships } from '@/lib/db'
import { eq, and, sql } from 'drizzle-orm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookOpen, Network, CalendarDays, Users, MapPin, Scroll, Swords } from 'lucide-react'

interface PublicCampaignPageProps {
  params: Promise<{ slug: string }>
}

// Entity type icons
const typeIcons: Record<string, React.ElementType> = {
  npc: Users,
  location: MapPin,
  quest: Scroll,
  session: CalendarDays,
  faction: Swords,
}

export default async function PublicCampaignPage({ params }: PublicCampaignPageProps) {
  const { slug } = await params

  // Get campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.publicSlug, slug),
    columns: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
    },
  })

  if (!campaign || !campaign.isPublic) {
    notFound()
  }

  // Get stats for public entities only
  const allEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.isDmOnly, false)
    ),
    columns: {
      id: true,
      entityType: true,
    },
  })

  // Calculate stats by type
  const statsByType: Record<string, number> = {}
  for (const entity of allEntities) {
    statsByType[entity.entityType] = (statsByType[entity.entityType] || 0) + 1
  }

  // Get relationship count
  const entityIds = new Set(allEntities.map((e) => e.id))
  const allRelationships = await db.query.relationships.findMany({
    where: eq(relationships.campaignId, campaign.id),
  })
  const publicRelationships = allRelationships.filter(
    (r) => entityIds.has(r.sourceEntityId) && entityIds.has(r.targetEntityId)
  )

  // Get recent entities
  const recentEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.isDmOnly, false)
    ),
    orderBy: (entities, { desc }) => [desc(entities.updatedAt)],
    limit: 6,
    columns: {
      id: true,
      name: true,
      entityType: true,
      updatedAt: true,
    },
  })

  // Get sessions count
  const sessionCount = statsByType['session'] || 0

  // Top entity types for display
  const topTypes = Object.entries(statsByType)
    .filter(([type]) => type !== 'session')
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Campaign Header */}
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold mb-4">{campaign.name}</h1>
        {campaign.description && (
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {campaign.description}
          </p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allEntities.length}</p>
                <p className="text-sm text-muted-foreground">Wiki Entries</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Network className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{publicRelationships.length}</p>
                <p className="text-sm text-muted-foreground">Connections</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sessionCount}</p>
                <p className="text-sm text-muted-foreground">Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Object.keys(statsByType).length}</p>
                <p className="text-sm text-muted-foreground">Entity Types</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Entity Types Overview */}
      {topTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wiki Contents</CardTitle>
            <CardDescription>Browse the campaign knowledge base by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {topTypes.map(([type, count]) => {
                const Icon = typeIcons[type] || BookOpen
                return (
                  <Link key={type} href={`/public/${slug}/entities?type=${type}`}>
                    <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 text-sm py-1.5 px-3">
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      {type.replace('_', ' ')} ({count})
                    </Badge>
                  </Link>
                )
              })}
              <Link href={`/public/${slug}/entities`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-muted text-sm py-1.5 px-3">
                  View all
                </Badge>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Entries */}
      {recentEntities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Updates</CardTitle>
            <CardDescription>Latest changes to the campaign wiki</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {recentEntities.map((entity) => (
                <Link
                  key={entity.id}
                  href={`/public/${slug}/entities/${entity.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="shrink-0">
                      {entity.entityType.replace('_', ' ')}
                    </Badge>
                    <span className="font-medium">{entity.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(entity.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link href={`/public/${slug}/entities`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <BookOpen className="h-8 w-8 mb-3 text-primary" />
              <h3 className="font-semibold mb-1">Browse Wiki</h3>
              <p className="text-sm text-muted-foreground">
                Explore all {allEntities.length} entries in the campaign knowledge base
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/public/${slug}/graph`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <Network className="h-8 w-8 mb-3 text-primary" />
              <h3 className="font-semibold mb-1">Knowledge Graph</h3>
              <p className="text-sm text-muted-foreground">
                Visualize {publicRelationships.length} connections between entities
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/public/${slug}/sessions`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <CalendarDays className="h-8 w-8 mb-3 text-primary" />
              <h3 className="font-semibold mb-1">Sessions</h3>
              <p className="text-sm text-muted-foreground">
                Read through {sessionCount} recorded game sessions
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
