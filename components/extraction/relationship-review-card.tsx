'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, ArrowRight } from 'lucide-react'
import type { StagedRelationship } from '@/lib/types'

interface RelationshipReviewCardProps {
  relationship: StagedRelationship
  onApprove: (tempId: string) => void
  onReject: (tempId: string) => void
}

// Relationship type labels
const relationshipLabels: Record<string, string> = {
  lives_in: 'Lives in',
  member_of: 'Member of',
  owns: 'Owns',
  created: 'Created',
  enemy_of: 'Enemy of',
  ally_of: 'Ally of',
  located_in: 'Located in',
  participated_in: 'Participated in',
  mentioned_in: 'Mentioned in',
  related_to: 'Related to',
  knows: 'Knows',
  serves: 'Serves',
  rules: 'Rules',
  guards: 'Guards',
  seeks: 'Seeks',
  fears: 'Fears',
  loves: 'Loves',
  hates: 'Hates',
  works_for: 'Works for',
  parent_of: 'Parent of',
  child_of: 'Child of',
  sibling_of: 'Sibling of',
  married_to: 'Married to',
  worships: 'Worships',
  leads: 'Leads',
  follows: 'Follows',
  created_by: 'Created by',
  contains: 'Contains',
  part_of: 'Part of',
  killed_by: 'Killed by',
  killed: 'Killed',
  visited: 'Visited',
  hired_by: 'Hired by',
  attacked: 'Attacked',
}

function RelationshipReviewCardComponent({
  relationship,
  onApprove,
  onReject,
}: RelationshipReviewCardProps) {
  const isApproved = relationship.status === 'approved'
  const isRejected = relationship.status === 'rejected'

  const label = relationshipLabels[relationship.relationshipType] || relationship.relationshipType.replace(/_/g, ' ')

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        isApproved
          ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
          : isRejected
          ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800 opacity-50'
          : 'bg-card'
      }`}
    >
      {/* Source entity */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm">{relationship.sourceEntityName}</span>
      </div>

      {/* Relationship type */}
      <div className="flex items-center gap-2 shrink-0">
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <Badge variant="outline" className="text-xs">
          {label}
        </Badge>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Target entity */}
      <div className="flex-1 min-w-0 text-right">
        <span className="font-medium text-sm">{relationship.targetEntityName}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onApprove(relationship.tempId)}
          disabled={isApproved}
        >
          <Check className="h-4 w-4 text-green-600" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onReject(relationship.tempId)}
          disabled={isRejected}
        >
          <X className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    </div>
  )
}

export const RelationshipReviewCard = memo(RelationshipReviewCardComponent)
