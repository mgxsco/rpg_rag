import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { EntityCard } from '@/components/entities/entity-card'
import { Search, Filter, Plus, Upload, AlertTriangle } from 'lucide-react'
import { Entity } from '@/lib/db/schema'

// Format entity type for display (e.g., 'player_character' -> 'Player Character')
function formatEntityType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default async function EntitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>
  searchParams: Promise<{ type?: string; search?: string }>
}) {
  const { campaignId } = await params
  const { type, search } = await searchParams

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

  // Get entities - wrapped in try/catch in case table doesn't exist yet
  let allEntities: Entity[] = []
  let migrationNeeded = false

  try {
    allEntities = await db
      .select()
      .from(entities)
      .where(eq(entities.campaignId, campaignId))
      .orderBy(desc(entities.updatedAt))
  } catch (error) {
    console.error('[Entities] Error fetching entities:', error)
    migrationNeeded = true
  }

  // Filter by type
  if (type) {
    allEntities = allEntities.filter((e) => e.entityType === type)
  }

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase()
    allEntities = allEntities.filter(
      (e) =>
        e.name.toLowerCase().includes(searchLower) ||
        e.aliases?.some((a) => a.toLowerCase().includes(searchLower))
    )
  }

  // Filter DM-only for non-DMs
  if (!isDM) {
    allEntities = allEntities.filter((e) => !e.isDmOnly)
  }

  // Get stats
  const stats = {
    total: allEntities.length,
    byType: {} as Record<string, number>,
  }
  for (const entity of allEntities) {
    stats.byType[entity.entityType] = (stats.byType[entity.entityType] || 0) + 1
  }

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Wiki</h1>
            <p className="text-muted-foreground">
              {stats.total} entities in your campaign knowledge base
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/campaigns/${campaignId}/entities/upload`}>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </Link>
            <Link href={`/campaigns/${campaignId}/entities/new`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Entity
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          <form className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search entities..."
                defaultValue={search}
                className="pl-9"
              />
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <Link href={`/campaigns/${campaignId}/entities`}>
              <Badge
                variant={!type ? 'default' : 'outline'}
                className="cursor-pointer"
              >
                All ({stats.total})
              </Badge>
            </Link>
            {Object.entries(stats.byType)
              .sort(([, a], [, b]) => b - a) // Sort by count descending
              .map(([typeValue, count]) => (
                <Link
                  key={typeValue}
                  href={`/campaigns/${campaignId}/entities?type=${typeValue}`}
                >
                  <Badge
                    variant={type === typeValue ? 'default' : 'outline'}
                    className="cursor-pointer"
                  >
                    {formatEntityType(typeValue)} ({count})
                  </Badge>
                </Link>
              ))}
          </div>
        </div>

        {migrationNeeded ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
            <h3 className="text-lg font-medium mb-2">Database Migration Required</h3>
            <p className="text-muted-foreground mb-4">
              The knowledge graph tables need to be created. Please run the migration.
            </p>
            <p className="text-sm text-muted-foreground">
              POST /api/admin/migrate-v2
            </p>
          </div>
        ) : allEntities.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allEntities.map((entity) => (
              <EntityCard
                key={entity.id}
                entity={entity}
                campaignId={campaignId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Filter className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No entities found</h3>
            <p className="mb-4">
              {type || search
                ? 'Try adjusting your filters'
                : 'Upload a document or create an entity to get started'}
            </p>
            <div className="flex justify-center gap-2">
              <Link href={`/campaigns/${campaignId}/entities/upload`}>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </Link>
              <Link href={`/campaigns/${campaignId}/entities/new`}>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Entity
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
