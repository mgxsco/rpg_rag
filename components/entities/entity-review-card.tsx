'use client'

import { memo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getEntityTypeIcon,
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
  RotateCcw,
} from 'lucide-react'
import type { StagedEntity, EntityMatch } from '@/lib/types'

interface EntityReviewCardProps {
  entity: StagedEntity
  existingMatch?: EntityMatch
  onApprove: (tempId: string) => void
  onReject: (tempId: string) => void
  onEdit: (tempId: string) => void
  onMerge: (tempId: string, targetId: string) => void
  onOpenMergeDialog: (tempId: string) => void
}

const statusStripColor = {
  pending: 'bg-muted-foreground/30',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  edited: 'bg-blue-500',
}

export const EntityReviewCard = memo(function EntityReviewCard({
  entity,
  existingMatch,
  onApprove,
  onReject,
  onEdit,
  onMerge,
  onOpenMergeDialog,
}: EntityReviewCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getEntityTypeIcon(entity.entityType)
  const typeColors = getEntityTypeColor(entity.entityType)

  const preview = (entity.content || '')
    .replace(/[#*_\[\]]/g, '')
    .slice(0, 150)
    .trim()

  const isApproved = entity.status === 'approved' || entity.status === 'edited'
  const isRejected = entity.status === 'rejected'

  // Collapsed view for rejected entities
  if (isRejected) {
    return (
      <Card className="relative overflow-hidden opacity-60">
        <div className={cn('absolute left-0 top-0 bottom-0 w-1', statusStripColor.rejected)} />
        <CardContent className="py-2 pl-4 pr-3">
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4 shrink-0', typeColors.text)} />
            <span className="text-sm text-muted-foreground line-through flex-1 truncate">
              {entity.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onApprove(entity.tempId)}
              title="Undo reject"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Undo
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden">
      {/* Status strip */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', statusStripColor[entity.status])} />

      <CardContent className="py-2.5 pl-4 pr-3">
        {/* Header: Icon + Name + Expand */}
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className={cn('h-4 w-4 shrink-0', typeColors.text)} />
          <span className="font-medium text-sm flex-1 truncate">{entity.name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Content preview */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
          {preview || 'No content...'}
        </p>

        {/* Actions row */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', isApproved && 'bg-green-500/10')}
            onClick={() => onApprove(entity.tempId)}
            title="Approve"
          >
            <Check className={cn('h-4 w-4', isApproved && 'text-green-600')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(entity.tempId)}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onOpenMergeDialog(entity.tempId)}
            title="Merge into existing entity"
          >
            <GitMerge className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-600"
            onClick={() => onReject(entity.tempId)}
            title="Reject"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Duplicate warning indicator */}
          {existingMatch && (
            <div className="flex items-center gap-1.5 ml-auto text-xs text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Duplicate?</span>
            </div>
          )}
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Content:</p>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded max-h-40 overflow-y-auto">
                {entity.content || 'No content'}
              </p>
            </div>

            {entity.aliases && entity.aliases.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Aliases:</p>
                <p className="text-sm text-muted-foreground">
                  {entity.aliases.join(', ')}
                </p>
              </div>
            )}

            {entity.tags && entity.tags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Tags:</p>
                <div className="flex flex-wrap gap-1">
                  {entity.tags.slice(0, 5).map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {entity.tags.length > 5 && (
                    <span className="text-xs text-muted-foreground">
                      +{entity.tags.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {existingMatch && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Matches "{existingMatch.existingEntity.name}" ({existingMatch.matchType}, {Math.round(existingMatch.confidence * 100)}%)
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
