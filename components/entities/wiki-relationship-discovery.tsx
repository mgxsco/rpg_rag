'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Loader2,
  Sparkles,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  GitBranch,
  Network,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react'
import { getEntityTypeIcon, getEntityTypeColor, getEntityTypeLabel } from '@/lib/entity-colors'

interface RelationshipSuggestion {
  sourceEntityId: string
  sourceEntityName: string
  sourceEntityType: string
  targetEntityId: string
  targetEntityName: string
  targetEntityType: string
  relationshipType: string
  reverseLabel: string
  reason: string
}

interface WikiRelationshipDiscoveryProps {
  campaignId: string
  entityCount: number
  existingRelationshipCount: number
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

type Phase = 'idle' | 'discovering' | 'reviewing' | 'complete'

export function WikiRelationshipDiscovery({
  campaignId,
  entityCount,
  existingRelationshipCount,
}: WikiRelationshipDiscoveryProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [batchIndex, setBatchIndex] = useState(0)
  const [processedEntities, setProcessedEntities] = useState(0)
  const [suggestions, setSuggestions] = useState<RelationshipSuggestion[]>([])
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)

  const getSuggestionKey = (s: RelationshipSuggestion) =>
    `${s.sourceEntityId}-${s.targetEntityId}-${s.relationshipType}`

  const discoverBatch = useCallback(async (index: number) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/discover-relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchIndex: index, batchSize: 20 }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Discovery failed')
      }

      const data = await response.json()

      setSuggestions(prev => {
        const existingKeys = new Set(prev.map(getSuggestionKey))
        const newSuggestions = (data.suggestions || []).filter(
          (s: RelationshipSuggestion) => !existingKeys.has(getSuggestionKey(s))
        )
        return [...prev, ...newSuggestions]
      })

      setProcessedEntities(data.processedEntities || 0)

      return data.hasMore
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed')
      return false
    }
  }, [campaignId])

  const startDiscovery = async () => {
    setPhase('discovering')
    setError(null)
    setSuggestions([])
    setApprovedIds(new Set())
    setRejectedIds(new Set())
    setBatchIndex(0)
    setProcessedEntities(0)
    setIsPaused(false)
    setCreatedCount(0)

    let currentBatch = 0
    let hasMore = true

    while (hasMore && !isPaused) {
      hasMore = await discoverBatch(currentBatch)
      currentBatch++
      setBatchIndex(currentBatch)

      // Small delay between batches
      if (hasMore) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    if (!hasMore) {
      setPhase('reviewing')
    }
  }

  const continueDiscovery = async () => {
    setIsPaused(false)
    setPhase('discovering')

    let currentBatch = batchIndex
    let hasMore = true

    while (hasMore && !isPaused) {
      hasMore = await discoverBatch(currentBatch)
      currentBatch++
      setBatchIndex(currentBatch)

      if (hasMore) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    if (!hasMore) {
      setPhase('reviewing')
    }
  }

  const pauseDiscovery = () => {
    setIsPaused(true)
    setPhase('reviewing')
  }

  const approveRelationship = async (suggestion: RelationshipSuggestion) => {
    const key = getSuggestionKey(suggestion)
    setCreating(key)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEntityId: suggestion.sourceEntityId,
          targetEntityId: suggestion.targetEntityId,
          relationshipType: suggestion.relationshipType,
          reverseLabel: suggestion.reverseLabel,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        if (response.status === 409) {
          // Already exists
          setApprovedIds(prev => new Set([...prev, key]))
        } else {
          throw new Error(data.error || 'Failed to create')
        }
      } else {
        setApprovedIds(prev => new Set([...prev, key]))
        setCreatedCount(c => c + 1)
      }
    } catch (err) {
      console.error('Error creating relationship:', err)
    } finally {
      setCreating(null)
    }
  }

  const rejectRelationship = (suggestion: RelationshipSuggestion) => {
    const key = getSuggestionKey(suggestion)
    setRejectedIds(prev => new Set([...prev, key]))
  }

  const approveAll = async () => {
    const pending = suggestions.filter(s => {
      const key = getSuggestionKey(s)
      return !approvedIds.has(key) && !rejectedIds.has(key)
    })

    for (const suggestion of pending) {
      await approveRelationship(suggestion)
      // Small delay between creations
      await new Promise(r => setTimeout(r, 100))
    }
  }

  const rejectAll = () => {
    const pending = suggestions.filter(s => {
      const key = getSuggestionKey(s)
      return !approvedIds.has(key) && !rejectedIds.has(key)
    })

    const newRejected = new Set(rejectedIds)
    pending.forEach(s => newRejected.add(getSuggestionKey(s)))
    setRejectedIds(newRejected)
  }

  const pendingSuggestions = suggestions.filter(s => {
    const key = getSuggestionKey(s)
    return !approvedIds.has(key) && !rejectedIds.has(key)
  })

  const progress = entityCount > 0 ? (processedEntities / entityCount) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="h-6 w-6" />
            Discover Relationships
          </h1>
          <p className="text-muted-foreground">
            AI analyzes all entities to find connections between them
          </p>
        </div>
        <Link href={`/campaigns/${campaignId}/entities`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Wiki
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{entityCount}</div>
            <p className="text-sm text-muted-foreground">Total Entities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{existingRelationshipCount + createdCount}</div>
            <p className="text-sm text-muted-foreground">Relationships</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{suggestions.length}</div>
            <p className="text-sm text-muted-foreground">Suggestions Found</p>
          </CardContent>
        </Card>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4">
          {error}
          <Button variant="outline" size="sm" className="ml-4" onClick={startDiscovery}>
            Retry
          </Button>
        </div>
      )}

      {/* Idle State */}
      {phase === 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to Discover</CardTitle>
            <CardDescription>
              The AI will analyze each entity's content and find relationships with other entities in your wiki.
              This process runs in batches and you can review suggestions as they come in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startDiscovery} disabled={entityCount < 2}>
              <Sparkles className="h-4 w-4 mr-2" />
              Start Discovery
            </Button>
            {entityCount < 2 && (
              <p className="text-sm text-muted-foreground mt-2">
                You need at least 2 entities to discover relationships.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Discovering State */}
      {phase === 'discovering' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyzing Entities...
            </CardTitle>
            <CardDescription>
              Processing batch {batchIndex + 1} • {processedEntities} of {entityCount} entities analyzed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={pauseDiscovery}>
                <Pause className="h-4 w-4 mr-2" />
                Pause & Review
              </Button>
            </div>
            {suggestions.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Found {suggestions.length} potential relationships so far...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reviewing State */}
      {(phase === 'reviewing' || phase === 'complete') && (
        <>
          {/* Controls */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2 text-sm">
                    <Badge variant="outline" className="text-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {approvedIds.size} approved
                    </Badge>
                    <Badge variant="outline" className="text-red-600">
                      <XCircle className="h-3 w-3 mr-1" />
                      {rejectedIds.size} rejected
                    </Badge>
                    <Badge variant="outline">
                      {pendingSuggestions.length} pending
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  {processedEntities < entityCount && (
                    <Button variant="outline" onClick={continueDiscovery}>
                      <Play className="h-4 w-4 mr-2" />
                      Continue Discovery
                    </Button>
                  )}
                  {pendingSuggestions.length > 0 && (
                    <>
                      <Button variant="outline" onClick={rejectAll}>
                        <X className="h-4 w-4 mr-2" />
                        Reject All
                      </Button>
                      <Button onClick={approveAll}>
                        <Check className="h-4 w-4 mr-2" />
                        Approve All
                      </Button>
                    </>
                  )}
                  <Button variant="outline" onClick={startDiscovery}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Start Over
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Suggestions List */}
          {suggestions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No new relationship suggestions found.</p>
                <p className="text-sm">
                  Either all potential relationships already exist, or the entities don't have enough
                  content to establish connections.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {suggestions.map((suggestion) => {
                const key = getSuggestionKey(suggestion)
                const isApproved = approvedIds.has(key)
                const isRejected = rejectedIds.has(key)
                const isCreating = creating === key

                const SourceIcon = getEntityTypeIcon(suggestion.sourceEntityType)
                const TargetIcon = getEntityTypeIcon(suggestion.targetEntityType)
                const sourceColors = getEntityTypeColor(suggestion.sourceEntityType)
                const targetColors = getEntityTypeColor(suggestion.targetEntityType)
                const label = relationshipLabels[suggestion.relationshipType] || suggestion.relationshipType

                return (
                  <Card
                    key={key}
                    className={`transition-all ${
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
                        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <SourceIcon className={`h-4 w-4 shrink-0 ${sourceColors.text}`} />
                            <span className="font-medium text-sm truncate">
                              {suggestion.sourceEntityName}
                            </span>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Badge variant="secondary" className="shrink-0">
                            {label}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex items-center gap-1.5 min-w-0">
                            <TargetIcon className={`h-4 w-4 shrink-0 ${targetColors.text}`} />
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
                              onClick={() => rejectRelationship(suggestion)}
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
          )}

          {/* Done message */}
          {pendingSuggestions.length === 0 && suggestions.length > 0 && (
            <Card className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800">
              <CardContent className="py-6 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-600" />
                <h3 className="text-lg font-medium">All done!</h3>
                <p className="text-muted-foreground">
                  {approvedIds.size} relationships created, {rejectedIds.size} skipped.
                </p>
                <div className="flex justify-center gap-2 mt-4">
                  <Link href={`/campaigns/${campaignId}/graph`}>
                    <Button>
                      <Network className="h-4 w-4 mr-2" />
                      View Knowledge Graph
                    </Button>
                  </Link>
                  <Link href={`/campaigns/${campaignId}/entities`}>
                    <Button variant="outline">
                      Back to Wiki
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
