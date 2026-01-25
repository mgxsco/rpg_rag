import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, campaigns, entities } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { BookOpen, Search, Filter } from 'lucide-react'

interface PublicEntitiesPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ type?: string; search?: string }>
}

export default async function PublicEntitiesPage({
  params,
  searchParams,
}: PublicEntitiesPageProps) {
  const { slug } = await params
  const { type, search } = await searchParams

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

  // Get all public entities
  let allEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.isDmOnly, false)
    ),
    orderBy: [desc(entities.updatedAt)],
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      entityType: true,
      aliases: true,
      tags: true,
      updatedAt: true,
    },
  })

  // Calculate stats before filtering
  const statsByType: Record<string, number> = {}
  for (const entity of allEntities) {
    statsByType[entity.entityType] = (statsByType[entity.entityType] || 0) + 1
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

  // Sort types by count
  const sortedTypes = Object.entries(statsByType).sort(([, a], [, b]) => b - a)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Wiki</h1>
        <p className="text-muted-foreground">
          {allEntities.length} {type ? `${type.replace('_', ' ')} entries` : 'entries'} in the campaign knowledge base
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form className="flex-1" action={`/public/${slug}/entities`} method="get">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              name="search"
              placeholder="Search entities..."
              defaultValue={search}
              className="pl-9"
            />
            {type && <input type="hidden" name="type" value={type} />}
          </div>
        </form>
      </div>

      {/* Type Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link href={`/public/${slug}/entities`}>
          <Badge
            variant={!type ? 'default' : 'outline'}
            className="cursor-pointer"
          >
            All ({Object.values(statsByType).reduce((a, b) => a + b, 0)})
          </Badge>
        </Link>
        {sortedTypes.map(([typeValue, count]) => (
          <Link
            key={typeValue}
            href={`/public/${slug}/entities?type=${typeValue}${search ? `&search=${search}` : ''}`}
          >
            <Badge
              variant={type === typeValue ? 'default' : 'outline'}
              className="cursor-pointer"
            >
              {typeValue.replace('_', ' ')} ({count})
            </Badge>
          </Link>
        ))}
      </div>

      {/* Entity Grid */}
      {allEntities.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allEntities.map((entity) => (
            <Link
              key={entity.id}
              href={`/public/${slug}/entities/${entity.id}`}
            >
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <Badge variant="outline" className="mb-2">
                    {entity.entityType.replace('_', ' ')}
                  </Badge>
                  <h3 className="font-semibold mb-1">{entity.name}</h3>
                  {entity.aliases && entity.aliases.length > 0 && (
                    <p className="text-xs text-muted-foreground italic mb-2">
                      aka: {entity.aliases.slice(0, 2).join(', ')}
                      {entity.aliases.length > 2 && '...'}
                    </p>
                  )}
                  {entity.tags && entity.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {entity.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Filter className="h-12 w-12 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No entities found</h3>
          <p>
            {type || search
              ? 'Try adjusting your filters'
              : 'This campaign has no public wiki entries yet'}
          </p>
        </div>
      )}
    </div>
  )
}
