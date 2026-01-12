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
} from '@/lib/entity-colors'
import { EntityActions } from './entity-actions'

interface EntityListRowProps {
  entity: Entity
  campaignId: string
  isDM?: boolean
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

export function EntityListRow({ entity, campaignId, isDM = false }: EntityListRowProps) {
  const Icon = getEntityTypeIcon(entity.entityType)
  const typeClasses = getEntityTypeBadgeClasses(entity.entityType)

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-border hover:bg-accent/50 transition-colors group">
      {/* Clickable area for navigation */}
      <Link
        href={`/campaigns/${campaignId}/entities/${entity.id}`}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        {/* Icon + Name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate group-hover:text-primary transition-colors">
            {entity.name}
          </span>
          {entity.isDmOnly && (
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </div>

        {/* Type Badge */}
        <Badge variant="outline" className={cn('shrink-0 text-xs', typeClasses)}>
          {getEntityTypeLabel(entity.entityType)}
        </Badge>

        {/* Tags (hidden on mobile) */}
        <div className="hidden sm:flex gap-1 shrink-0 max-w-[120px]">
          {entity.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs truncate max-w-[60px]">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Updated time */}
        <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
          {formatTimeAgo(new Date(entity.updatedAt))}
        </span>
      </Link>

      {/* Actions dropdown */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
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
