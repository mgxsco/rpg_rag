'use client'

import { Badge } from '@/components/ui/badge'
import { EntityDetailActions } from './entity-detail-actions'
import { EntityConnectionsTabs } from './entity-connections-tabs'
import { EntitySourcesAccordion } from './entity-sources-accordion'
import { Clock, User } from 'lucide-react'

interface Entity {
  id: string
  name: string
  entityType: string
  aliases?: string[] | null
  isDmOnly?: boolean | null
  updatedAt: Date
  player?: {
    user: {
      id: string
      name: string | null
      email: string
    }
  } | null
}

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

interface Source {
  id: string
  excerpt?: string | null
  document: {
    id: string
    name: string
    createdAt: Date
  }
}

interface EntitySidebarProps {
  entity: Entity
  campaignId: string
  isDM: boolean
  outgoingRels: Relationship[]
  incomingRels: Relationship[]
  contentBacklinks: BacklinkEntity[]
  sources: Source[]
}

export function EntitySidebar({
  entity,
  campaignId,
  isDM,
  outgoingRels,
  incomingRels,
  contentBacklinks,
  sources,
}: EntitySidebarProps) {
  return (
    <aside className="hidden lg:block w-64 xl:w-72 shrink-0">
      <div className="sticky top-20 space-y-4 p-3 rounded-sm border-2 border-border bg-gradient-to-b from-card to-[hsl(35_25%_88%)] shadow-lg relative">
        {/* Decorative corner ornaments */}
        <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-[hsl(45_80%_45%)] opacity-60" />
        <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-[hsl(45_80%_45%)] opacity-60" />
        <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-[hsl(45_80%_45%)] opacity-60" />
        <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-[hsl(45_80%_45%)] opacity-60" />

        {/* Quick Info Section */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Quick Info
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {entity.entityType.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Updated {new Date(entity.updatedAt).toLocaleDateString()}</span>
            </div>
            {entity.entityType === 'player_character' && entity.player && (
              <div className="flex items-center gap-2 text-xs">
                <User className="h-3 w-3 text-primary" />
                <span>{entity.player.user.name || entity.player.user.email}</span>
              </div>
            )}
            {entity.aliases && entity.aliases.length > 0 && (
              <p className="text-xs text-muted-foreground italic line-clamp-2">
                AKA: {entity.aliases.join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Gold separator */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(45_80%_45%)] to-transparent opacity-50" />

        {/* DM Actions */}
        {isDM && (
          <>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Actions
              </h3>
              <EntityDetailActions
                entityId={entity.id}
                entityName={entity.name}
                campaignId={campaignId}
                variant="sidebar"
              />
            </div>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(45_80%_45%)] to-transparent opacity-50" />
          </>
        )}

        {/* Connections Section */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Connections
          </h3>
          <EntityConnectionsTabs
            campaignId={campaignId}
            outgoingRels={outgoingRels}
            incomingRels={incomingRels}
            contentBacklinks={contentBacklinks}
          />
        </div>

        {/* Sources Section */}
        {sources.length > 0 && (
          <>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(45_80%_45%)] to-transparent opacity-50" />
            <EntitySourcesAccordion sources={sources} />
          </>
        )}
      </div>
    </aside>
  )
}
