'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, Sparkles, Check, X, ArrowRight, GitBranch } from 'lucide-react'
import { getEntityTypeIcon, getEntityTypeColor, getEntityTypeLabel } from '@/lib/entity-colors'

interface RelationshipSuggestion {
  targetEntityId: string
  targetEntityName: string
  targetEntityType: string
  relationshipType: string
  reverseLabel: string
  reason: string
}

interface RelationshipDiscoveryProps {
  campaignId: string
  entityId: string
  entityName: string
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
  knows: 'Knows',
  serves: 'Serves',
  rules: 'Rules',
  parent_of: 'Parent of',
  child_of: 'Child of',
  sibling_of: 'Sibling of',
  married_to: 'Married to',
  works_for: 'Works for',
  killed: 'Killed',
  killed_by: 'Killed by',
  worships: 'Worships',
  guards: 'Guards',
  seeks: 'Seeks',
  fears: 'Fears',
  loves: 'Loves',
  hates: 'Hates',
  contains: 'Contains',
  part_of: 'Part of',
  visited: 'Visited',
  related_to: 'Related to',
}

export function RelationshipDiscovery({
  campaignId,
  entityId,
  entityName,
}: RelationshipDiscoveryProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<RelationshipSuggestion[]>([])
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const discoverRelationships = async () => {
    setLoading(true)
    setError(null)
    setSuggestions([])
    setApprovedIds(new Set())
    setRejectedIds(new Set())

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/entities/${entityId}/discover-relationships`,
        { method: 'POST' }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Discovery failed')
      }

      const data = await response.json()
      setSuggestions(data.suggestions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover relationships')
    } finally {
      setLoading(false)
    }
  }

  const approveRelationship = async (suggestion: RelationshipSuggestion) => {
    setCreating(suggestion.targetEntityId)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEntityId: entityId,
          targetEntityId: suggestion.targetEntityId,
          relationshipType: suggestion.relationshipType,
          reverseLabel: suggestion.reverseLabel,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        if (response.status === 409) {
          // Already exists, mark as approved
          setApprovedIds((prev) => new Set([...prev, suggestion.targetEntityId]))
        } else {
          throw new Error(data.error || 'Failed to create relationship')
        }
      } else {
        setApprovedIds((prev) => new Set([...prev, suggestion.targetEntityId]))
      }
    } catch (err) {
      console.error('Error creating relationship:', err)
    } finally {
      setCreating(null)
    }
  }

  const rejectRelationship = (targetEntityId: string) => {
    setRejectedIds((prev) => new Set([...prev, targetEntityId]))
  }

  const pendingSuggestions = suggestions.filter(
    (s) => !approvedIds.has(s.targetEntityId) && !rejectedIds.has(s.targetEntityId)
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={() => !suggestions.length && discoverRelationships()}>
          <GitBranch className="h-4 w-4 mr-2" />
          Discover Relationships
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Discover Relationships for {entityName}
          </DialogTitle>
          <DialogDescription>
            AI analyzes entity content to find potential relationships with other wiki entries.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Analyzing relationships...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-4">
              {error}
              <Button variant="outline" size="sm" className="ml-4" onClick={discoverRelationships}>
                Retry
              </Button>
            </div>
          )}

          {/* No suggestions */}
          {!loading && !error && suggestions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Click the button below to discover potential relationships.</p>
              <Button className="mt-4" onClick={discoverRelationships}>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Discovery
              </Button>
            </div>
          )}

          {/* Suggestions list */}
          {!loading && suggestions.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found {suggestions.length} potential relationships
                </p>
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline" className="text-green-600">
                    {approvedIds.size} approved
                  </Badge>
                  <Badge variant="outline" className="text-red-600">
                    {rejectedIds.size} rejected
                  </Badge>
                  <Badge variant="outline">
                    {pendingSuggestions.length} pending
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                {suggestions.map((suggestion) => {
                  const isApproved = approvedIds.has(suggestion.targetEntityId)
                  const isRejected = rejectedIds.has(suggestion.targetEntityId)
                  const isCreating = creating === suggestion.targetEntityId

                  const Icon = getEntityTypeIcon(suggestion.targetEntityType)
                  const colors = getEntityTypeColor(suggestion.targetEntityType)
                  const label = relationshipLabels[suggestion.relationshipType] || suggestion.relationshipType

                  return (
                    <Card
                      key={suggestion.targetEntityId}
                      className={`${
                        isApproved
                          ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                          : isRejected
                          ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800 opacity-50'
                          : ''
                      }`}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center gap-3">
                          {/* Relationship visualization */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-medium text-sm truncate">{entityName}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Badge variant="secondary" className="shrink-0">
                              {label}
                            </Badge>
                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Icon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                              <span className="font-medium text-sm truncate">
                                {suggestion.targetEntityName}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          {!isApproved && !isRejected && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => approveRelationship(suggestion)}
                                disabled={isCreating}
                              >
                                {isCreating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 text-green-600" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => rejectRelationship(suggestion.targetEntityId)}
                                disabled={isCreating}
                              >
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          )}

                          {isApproved && (
                            <Badge variant="outline" className="text-green-600 shrink-0">
                              Created
                            </Badge>
                          )}

                          {isRejected && (
                            <Badge variant="outline" className="text-red-600 shrink-0">
                              Skipped
                            </Badge>
                          )}
                        </div>

                        {/* Reason */}
                        {suggestion.reason && !isRejected && (
                          <p className="text-xs text-muted-foreground mt-2 pl-4 border-l-2 border-muted">
                            {suggestion.reason}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Refresh button */}
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={discoverRelationships} disabled={loading}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Refresh Suggestions
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
