'use client'

import { memo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Entity } from '@/lib/db/schema'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getEntityTypeIcon,
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
  getEntityTypeColor,
} from '@/lib/entity-colors'
import { EntityActions } from './entity-actions'

interface EntityListRowProps {
  entity: Entity
  campaignId: string
  isDM?: boolean
  index?: number
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) {
    return diffMins <= 1 ? 'just now' : `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return date.toLocaleDateString()
  }
}

export const EntityListRow = memo(function EntityListRow({ entity, campaignId, isDM = false, index = 0 }: EntityListRowProps) {
  const Icon = getEntityTypeIcon(entity.entityType)
  const typeClasses = getEntityTypeBadgeClasses(entity.entityType)
  const typeColors = getEntityTypeColor(entity.entityType)

  return (
    <div className="group flex items-center bg-card hover:bg-muted/50 transition-colors">
      {/* Type indicator bar */}
      <div
        className="w-1 self-stretch shrink-0"
        style={{ backgroundColor: typeColors.hex }}
      />

      {/* Clickable area for navigation */}
      <Link
        href={`/campaigns/${campaignId}/entities/${entity.id}`}
        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5"
      >
        {/* Icon */}
        <div className={cn("flex items-center justify-center w-7 h-7 rounded shrink-0", typeColors.bg)}>
          <Icon className={cn("h-4 w-4", typeColors.text)} />
        </div>

        {/* Name */}
        <span className="flex-1 min-w-0 truncate font-medium group-hover:text-primary transition-colors">
          {entity.name}
          {entity.isDmOnly && (
            <Lock className="inline h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
          )}
        </span>

        {/* Type Badge */}
        <Badge variant="outline" className={cn('shrink-0 hidden sm:flex', typeClasses)}>
          {getEntityTypeLabel(entity.entityType)}
        </Badge>

        {/* Updated time */}
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
          {formatTimeAgo(new Date(entity.updatedAt))}
        </span>
      </Link>

      {/* Actions dropdown */}
      <div className="shrink-0 px-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <EntityActions
          entityId={entity.id}
          entityName={entity.name}
          campaignId={campaignId}
          isDM={isDM}
        />
      </div>
    </div>
  )
})
