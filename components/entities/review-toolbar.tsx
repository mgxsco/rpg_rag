'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getEntityTypeIcon,
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
} from '@/lib/entity-colors'
import { CheckCheck, X, Filter, RotateCcw } from 'lucide-react'
import type { StagedEntity } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ReviewToolbarProps {
  entities: StagedEntity[]
  selectedType: string | null
  onSelectType: (type: string | null) => void
  onApproveAll: () => void
  onRejectAll: () => void
  onResetAll: () => void
}

export function ReviewToolbar({
  entities,
  selectedType,
  onSelectType,
  onApproveAll,
  onRejectAll,
  onResetAll,
}: ReviewToolbarProps) {
  // Count entities by status
  const stats = {
    total: entities.length,
    pending: entities.filter((e) => e.status === 'pending').length,
    approved: entities.filter((e) => e.status === 'approved' || e.status === 'edited').length,
    rejected: entities.filter((e) => e.status === 'rejected').length,
  }

  // Get unique entity types with counts
  const typeGroups = entities.reduce((acc, entity) => {
    acc[entity.entityType] = (acc[entity.entityType] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortedTypes = Object.entries(typeGroups).sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            <strong>{stats.total}</strong> entities extracted
          </span>
          {stats.approved > 0 && (
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
              {stats.approved} approved
            </Badge>
          )}
          {stats.pending > 0 && (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {stats.pending} pending
            </Badge>
          )}
          {stats.rejected > 0 && (
            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
              {stats.rejected} rejected
            </Badge>
          )}
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onApproveAll}
            disabled={stats.pending === 0}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Approve All Pending
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onRejectAll}
            disabled={stats.pending === 0}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reject All Pending
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onResetAll}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Type filter */}
      {sortedTypes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          <Badge
            variant={selectedType === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => onSelectType(null)}
          >
            All ({stats.total})
          </Badge>
          {sortedTypes.map(([type, count]) => {
            const Icon = getEntityTypeIcon(type)
            const typeClasses = getEntityTypeBadgeClasses(type)
            const isSelected = selectedType === type

            return (
              <Badge
                key={type}
                variant={isSelected ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && typeClasses
                )}
                onClick={() => onSelectType(isSelected ? null : type)}
              >
                <Icon className="h-3 w-3 mr-1" />
                {getEntityTypeLabel(type)} ({count})
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
