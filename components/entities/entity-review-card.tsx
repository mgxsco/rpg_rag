'use client'

import { memo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getEntityTypeIcon,
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
  getEntityTypeColor,
} from '@/lib/entity-colors'
import {
  Check,
  X,
  Pencil,
  GitMerge,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { StagedEntity, EntityMatch } from '@/lib/types'
import { useState } from 'react'

interface EntityReviewCardProps {
  entity: StagedEntity
  existingMatch?: EntityMatch
  onApprove: (tempId: string) => void
  onReject: (tempId: string) => void
  onEdit: (tempId: string) => void
  onMerge: (tempId: string, targetId: string) => void
}

export const EntityReviewCard = memo(function EntityReviewCard({
  entity,
  existingMatch,
  onApprove,
  onReject,
  onEdit,
  onMerge,
}: EntityReviewCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getEntityTypeIcon(entity.entityType)
  const typeClasses = getEntityTypeBadgeClasses(entity.entityType)
  const typeColors = getEntityTypeColor(entity.entityType)

  // Get preview text - first 150 chars of content
  const preview = (entity.content || '')
    .replace(/[#*_\[\]]/g, '')
    .slice(0, 150)
    .trim()

  const statusColors = {
    pending: 'bg-muted text-muted-foreground',
    approved: 'bg-green-500/10 text-green-600 border-green-500/20',
    rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
    edited: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  }

  const cardBorderColors = {
    pending: '',
    approved: 'border-green-500/30',
    rejected: 'border-red-500/30 opacity-60',
    edited: 'border-blue-500/30',
  }

  return (
    <Card className={cn('transition-all', cardBorderColors[entity.status])}>
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-start gap-2">
          {/* Entity type icon */}
          <div className={cn('entity-icon-wrapper shrink-0 p-1.5 rounded', typeColors.bg)}>
            <Icon className={cn('h-4 w-4', typeColors.text)} />
          </div>

          {/* Name and badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{entity.name}</span>
              <Badge variant="outline" className={cn('text-xs', typeClasses)}>
                {getEntityTypeLabel(entity.entityType)}
              </Badge>
              <Badge variant="outline" className={cn('text-xs', statusColors[entity.status])}>
                {entity.status}
              </Badge>
            </div>

            {/* Aliases preview */}
            {entity.aliases && entity.aliases.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1 italic truncate">
                aka: {entity.aliases.slice(0, 3).join(', ')}
                {entity.aliases.length > 3 && ` +${entity.aliases.length - 3} more`}
              </p>
            )}
          </div>

          {/* Expand button */}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-7 w-7 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 px-3 pb-3">
        {/* Duplicate warning */}
        {existingMatch && entity.status !== 'rejected' && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-md p-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Possible duplicate detected
              </p>
              <p className="text-xs text-muted-foreground">
                Matches existing entity "{existingMatch.existingEntity.name}"
                ({existingMatch.matchType} match, {Math.round(existingMatch.confidence * 100)}% confidence)
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1.5 h-6 text-xs"
                onClick={() => onMerge(entity.tempId, existingMatch.existingEntity.id)}
              >
                <GitMerge className="h-3 w-3 mr-1" />
                Merge into existing
              </Button>
            </div>
          </div>
        )}

        {/* Content preview */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {preview || 'No content...'}
        </p>

        {/* Expanded content */}
        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Full Content:</p>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded max-h-40 overflow-y-auto">
                {entity.content || 'No content'}
              </p>
            </div>

            {entity.aliases && entity.aliases.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Aliases:</p>
                <div className="flex flex-wrap gap-1">
                  {entity.aliases.map((alias, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {alias}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {entity.tags && entity.tags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Tags:</p>
                <div className="flex flex-wrap gap-1">
                  {entity.tags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {entity.status !== 'rejected' && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t">
            <Button
              variant={entity.status === 'approved' ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-7 text-xs',
                entity.status === 'approved' && 'bg-green-600 hover:bg-green-700'
              )}
              onClick={() => onApprove(entity.tempId)}
            >
              <Check className="h-3 w-3 mr-1" />
              {entity.status === 'approved' ? 'Approved' : 'Approve'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onEdit(entity.tempId)}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onReject(entity.tempId)}
            >
              <X className="h-3 w-3 mr-1" />
              Reject
            </Button>
          </div>
        )}

        {/* Rejected state - allow undo */}
        {entity.status === 'rejected' && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t">
            <p className="text-xs text-muted-foreground flex-1">This entity will not be created.</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onApprove(entity.tempId)}
            >
              Undo Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
