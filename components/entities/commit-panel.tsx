'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  getEntityTypeIcon,
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
} from '@/lib/entity-colors'
import { CheckCircle, Loader2, FileText, Link2, ArrowRight } from 'lucide-react'
import type { StagedEntity, StagedRelationship } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CommitPanelProps {
  entities: StagedEntity[]
  relationships: StagedRelationship[]
  fileName: string
  isCommitting: boolean
  onCommit: () => void
}

export function CommitPanel({
  entities,
  relationships,
  fileName,
  isCommitting,
  onCommit,
}: CommitPanelProps) {
  // Get approved entities (including edited)
  const approvedEntities = entities.filter(
    (e) => e.status === 'approved' || e.status === 'edited'
  )

  // Get entities being merged
  const mergedEntities = approvedEntities.filter((e) => e.mergeTargetId)
  const newEntities = approvedEntities.filter((e) => !e.mergeTargetId)

  // Count relationships that can be created (both entities must be approved)
  const approvedTempIds = new Set(approvedEntities.map((e) => e.tempId))
  const validRelationships = relationships.filter(
    (r) =>
      approvedTempIds.has(r.sourceEntityTempId) &&
      approvedTempIds.has(r.targetEntityTempId)
  )

  // Group approved entities by type for summary
  const typeGroups = newEntities.reduce((acc, entity) => {
    acc[entity.entityType] = (acc[entity.entityType] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortedTypes = Object.entries(typeGroups).sort(([, a], [, b]) => b - a)

  const canCommit = approvedEntities.length > 0

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Commit Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File name */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Source Document:</p>
          <p className="text-sm font-medium truncate">{fileName}</p>
        </div>

        {/* Entity summary */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Entities to Create:</p>
          {newEntities.length === 0 && mergedEntities.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No entities approved yet
            </p>
          ) : (
            <div className="space-y-2">
              {/* New entities by type */}
              {sortedTypes.map(([type, count]) => {
                const Icon = getEntityTypeIcon(type)
                const typeClasses = getEntityTypeBadgeClasses(type)

                return (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('h-4 w-4', typeClasses.split(' ')[1])} />
                      <span className="text-sm">{getEntityTypeLabel(type)}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {count}
                    </Badge>
                  </div>
                )
              })}

              {/* Merged entities */}
              {mergedEntities.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Merging into existing</span>
                  </div>
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600">
                    {mergedEntities.length}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Relationships summary */}
        {validRelationships.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Relationships to Create:</p>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{validRelationships.length} connections</span>
            </div>
          </div>
        )}

        {/* Total summary */}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Total Changes:</span>
            <span>
              {newEntities.length + mergedEntities.length} entities,{' '}
              {validRelationships.length} relationships
            </span>
          </div>
        </div>

        {/* Commit button */}
        <Button
          className="w-full"
          size="lg"
          onClick={onCommit}
          disabled={!canCommit || isCommitting}
        >
          {isCommitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Committing...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Commit {approvedEntities.length} Entities
            </>
          )}
        </Button>

        {!canCommit && (
          <p className="text-xs text-muted-foreground text-center">
            Approve at least one entity to commit
          </p>
        )}
      </CardContent>
    </Card>
  )
}
