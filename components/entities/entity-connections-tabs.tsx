'use client'

import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, ArrowLeft } from 'lucide-react'

interface Relationship {
  id: string
  relationshipType: string
  reverseLabel?: string | null
  targetEntity?: {
    id: string
    name: string
    entityType: string
  }
  sourceEntity?: {
    id: string
    name: string
    entityType: string
  }
}

interface BacklinkEntity {
  id: string
  name: string
  entityType: string
}

interface EntityConnectionsTabsProps {
  campaignId: string
  outgoingRels: Relationship[]
  incomingRels: Relationship[]
  contentBacklinks: BacklinkEntity[]
}

export function EntityConnectionsTabs({
  campaignId,
  outgoingRels,
  incomingRels,
  contentBacklinks,
}: EntityConnectionsTabsProps) {
  const linksCount = outgoingRels.length
  const mentionsCount = incomingRels.length + contentBacklinks.length

  if (linksCount === 0 && mentionsCount === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No connections yet
      </div>
    )
  }

  return (
    <Tabs defaultValue={linksCount > 0 ? 'links' : 'mentions'} className="w-full">
      <TabsList className="w-full grid grid-cols-2 h-8">
        <TabsTrigger value="links" className="text-xs px-2" disabled={linksCount === 0}>
          Links
          {linksCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
              {linksCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="mentions" className="text-xs px-2" disabled={mentionsCount === 0}>
          Mentions
          {mentionsCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
              {mentionsCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="links" className="mt-2 max-h-[200px] overflow-y-auto">
        <div className="space-y-1">
          {outgoingRels.map((rel) => (
            <Link
              key={rel.id}
              href={`/campaigns/${campaignId}/entities/${rel.targetEntity?.id}`}
              className="flex items-center gap-1.5 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors text-sm group"
            >
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate group-hover:text-primary">
                {rel.targetEntity?.name}
              </span>
              <Badge variant="outline" className="text-[10px] px-1 h-4 shrink-0 ml-auto">
                {rel.relationshipType.replace('_', ' ')}
              </Badge>
            </Link>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="mentions" className="mt-2 max-h-[200px] overflow-y-auto">
        <div className="space-y-1">
          {/* Relationship backlinks */}
          {incomingRels.map((rel) => (
            <Link
              key={rel.id}
              href={`/campaigns/${campaignId}/entities/${rel.sourceEntity?.id}`}
              className="flex items-center gap-1.5 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors text-sm group"
            >
              <ArrowLeft className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate group-hover:text-primary">
                {rel.sourceEntity?.name}
              </span>
              <Badge variant="outline" className="text-[10px] px-1 h-4 shrink-0 ml-auto">
                {rel.reverseLabel || rel.relationshipType.replace('_', ' ')}
              </Badge>
            </Link>
          ))}

          {/* Content backlinks */}
          {contentBacklinks.map((entity) => (
            <Link
              key={entity.id}
              href={`/campaigns/${campaignId}/entities/${entity.id}`}
              className="flex items-center gap-1.5 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors text-sm group"
            >
              <ArrowLeft className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate group-hover:text-primary">
                {entity.name}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1 h-4 shrink-0 ml-auto">
                {entity.entityType.replace('_', ' ')}
              </Badge>
            </Link>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  )
}
