'use client'

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

export function EntityListRow({ entity, campaignId, isDM = false, index = 0 }: EntityListRowProps) {
  const Icon = getEntityTypeIcon(entity.entityType)
  const typeClasses = getEntityTypeBadgeClasses(entity.entityType)
  const typeColors = getEntityTypeColor(entity.entityType)

  return (
    <div className="entity-list-row group">
      {/* Type indicator bar */}
      <div
        className="list-type-indicator"
        style={{ backgroundColor: typeColors.hex }}
      />

      {/* Clickable area for navigation */}
      <Link
        href={`/campaigns/${campaignId}/entities/${entity.id}`}
        className="entity-list-link flex-1 min-w-0"
      >
        {/* Icon */}
        <div className={cn("list-icon-wrapper", typeColors.bg)}>
          <Icon className={cn("h-4 w-4", typeColors.text)} />
        </div>

        {/* Name */}
        <span className="list-entity-name truncate">
          {entity.name}
          {entity.isDmOnly && (
            <Lock className="dm-lock-icon inline h-3.5 w-3.5 ml-1.5" />
          )}
        </span>

        {/* Type Badge */}
        <Badge variant="outline" className={cn('entity-type-badge shrink-0', typeClasses)}>
          {getEntityTypeLabel(entity.entityType)}
        </Badge>


        {/* Updated time */}
        <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
          {formatTimeAgo(new Date(entity.updatedAt))}
        </span>
      </Link>

      {/* Actions dropdown - visible on mobile, hover on desktop */}
      <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity px-2">
        <EntityActions
          entityId={entity.id}
          entityName={entity.name}
          campaignId={campaignId}
          isDM={isDM}
        />
      </div>
    </div>
  )
}
