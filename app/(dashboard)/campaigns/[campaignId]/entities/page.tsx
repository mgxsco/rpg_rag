import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, desc, asc } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { EntityCard } from '@/components/entities/entity-card'
import { EntityStats } from '@/components/entities/entity-stats'
import { EntityToolbar } from '@/components/entities/entity-toolbar'
import { EntityListRow } from '@/components/entities/entity-list-row'
import { Filter, Plus, Upload, AlertTriangle } from 'lucide-react'
import { Entity } from '@/lib/db/schema'

export default async function EntitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>
  searchParams: Promise<{ type?: string; search?: string; view?: string; sort?: string }>
}) {
  const { campaignId } = await params
  const { type, search, view = 'grid', sort = 'updated' } = await searchParams

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

  // Calculate stats before filtering
  const totalCount = allEntities.filter(e => isDM || !e.isDmOnly).length
  const statsByType: Record<string, number> = {}
  for (const entity of allEntities) {
    if (!isDM && entity.isDmOnly) continue
    statsByType[entity.entityType] = (statsByType[entity.entityType] || 0) + 1
  }

  // Filter DM-only for non-DMs
  if (!isDM) {
    allEntities = allEntities.filter((e) => !e.isDmOnly)
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

  // Apply sorting
  switch (sort) {
    case 'name-asc':
      allEntities.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'name-desc':
      allEntities.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'type':
      allEntities.sort((a, b) => a.entityType.localeCompare(b.entityType))
      break
    case 'oldest':
      allEntities.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      break
    case 'updated':
    default:
      allEntities.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      break
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 sm:gap-4 md:gap-5 max-w-full overflow-hidden">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-16 md:pb-0 overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Wiki</h1>
            <p className="text-muted-foreground">
              {totalCount} entities in your campaign knowledge base
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/campaigns/${campaignId}/entities/upload`}>
              <Button variant="outline" size="sm" className="sm:size-default">
                <Upload className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Upload Document</span>
              </Button>
            </Link>
            <Link href={`/campaigns/${campaignId}/entities/new`}>
              <Button size="sm" className="sm:size-default">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New Entity</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Dashboard */}
        <EntityStats
          campaignId={campaignId}
          stats={statsByType}
          total={totalCount}
          activeType={type}
        />

        {/* Toolbar with View Toggle, Sort, Search */}
        <EntityToolbar
          campaignId={campaignId}
          view={view as 'grid' | 'list'}
          sort={sort}
          search={search}
        />

        {/* Content */}
        {migrationNeeded ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-yellow-500" />
            <h3 className="text-lg font-medium mb-2">Database Migration Required</h3>
            <p className="text-muted-foreground mb-4">
              The knowledge graph tables need to be created. Please run the migration.
            </p>
            <p className="text-sm text-muted-foreground">
              POST /api/admin/migrate-v2
            </p>
          </div>
        ) : allEntities.length > 0 ? (
          view === 'list' ? (
            // List View
            <div className="border rounded-lg divide-y overflow-hidden">
              {allEntities.map((entity, index) => (
                <EntityListRow
                  key={entity.id}
                  entity={entity}
                  campaignId={campaignId}
                  isDM={isDM}
                  index={index}
                />
              ))}
            </div>
          ) : (
            // Grid View
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
              {allEntities.map((entity, index) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  campaignId={campaignId}
                  isDM={isDM}
                  index={index}
                />
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Filter className="h-10 w-10 mx-auto mb-3" />
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
