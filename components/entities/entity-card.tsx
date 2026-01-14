'use client'

import { memo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

interface EntityCardProps {
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

export const EntityCard = memo(function EntityCard({ entity, campaignId, isDM = false, index = 0 }: EntityCardProps) {
  const Icon = getEntityTypeIcon(entity.entityType)
  const typeClasses = getEntityTypeBadgeClasses(entity.entityType)
  const typeColors = getEntityTypeColor(entity.entityType)

  // Get first 100 chars of content for preview (shorter for compact cards)
  const preview = (entity.content || '')
    .replace(/[#*_\[\]]/g, '')
    .slice(0, 100)
    .trim()

  return (
    <div className="entity-card-wrapper relative group h-full">
      <Link href={`/campaigns/${campaignId}/entities/${entity.id}`}>
        <Card className="entity-card cursor-pointer h-full">
          {/* Corner flourishes */}
          <div className="entity-card-corner top-left" />
          <div className="entity-card-corner top-right" />

          {/* Type indicator strip */}
          <div
            className="entity-type-strip"
            style={{ background: `linear-gradient(90deg, ${typeColors.hex}40, ${typeColors.hex}10, transparent)` }}
          />

          <CardHeader className="pb-1 pt-3 px-3 relative z-10">
            {/* Compact header: Icon + Title + Lock + Badge on same row */}
            <div className="flex items-start gap-2">
              <div className={cn("entity-icon-wrapper shrink-0", typeColors.bg)}>
                <Icon className={cn("h-4 w-4", typeColors.text)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="entity-title text-base line-clamp-1 flex-1">
                    {entity.name}
                  </CardTitle>
                  {entity.isDmOnly && (
                    <Lock className="dm-lock-icon h-3.5 w-3.5 shrink-0" />
                  )}
                  <Badge variant="outline" className={cn("entity-type-badge shrink-0 text-xs", typeClasses)}>
                    {getEntityTypeLabel(entity.entityType)}
                  </Badge>
                </div>
              </div>
            </div>

          </CardHeader>

          <CardContent className="relative z-10 pt-1 px-3 pb-3">
            <p className="text-sm text-muted-foreground line-clamp-2">
              {preview || 'No content yet...'}
            </p>
            {/* Consolidated footer: aliases + date on same line */}
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5">
              {entity.aliases && entity.aliases.length > 0 ? (
                <span className="italic truncate max-w-[60%]">
                  aka: {entity.aliases.slice(0, 2).join(', ')}
                  {entity.aliases.length > 2 && ` +${entity.aliases.length - 2}`}
                </span>
              ) : (
                <span />
              )}
              <span className="shrink-0 opacity-75">
                {formatTimeAgo(new Date(entity.updatedAt))}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Actions dropdown - visible on mobile, hover on desktop */}
      <div className="absolute top-2 right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-20">
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
