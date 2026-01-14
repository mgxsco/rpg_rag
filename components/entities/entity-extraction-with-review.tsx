'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText, Loader2, CheckCircle, ArrowLeft, Search, GitMerge, Sparkles } from 'lucide-react'
import { EntityReviewCard } from '@/components/entities/entity-review-card'
import { EntityEditModal } from '@/components/entities/entity-edit-modal'
import { ReviewToolbar } from '@/components/entities/review-toolbar'
import { CommitPanel } from '@/components/entities/commit-panel'
import {
  getEntityTypeIcon,
  getEntityTypeColor,
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
} from '@/lib/entity-colors'
import type {
  StagedEntity,
  StagedRelationship,
  EntityMatch,
  ExtractPreviewResponse,
  BatchCommitRequest,
  BatchCommitResponse,
  ApprovedEntity,
  ApprovedRelationship,
} from '@/lib/types'

interface EntityExtractionWithReviewProps {
  campaignId: string
  entityId: string
  entityName: string
  entityContent: string
  entityType: string
}

type ReviewPhase = 'extracting' | 'review' | 'committing' | 'complete'

interface CommitResult {
  documentId: string
  createdCount: number
  mergedCount: number
  relationshipsCount: number
  embeddingsStatus?: {
    total: number
    succeeded: number
    failed: number
  }
}

export function EntityExtractionWithReview({
  campaignId,
  entityId,
  entityName,
  entityContent,
  entityType,
}: EntityExtractionWithReviewProps) {
  // Phase management
  const [phase, setPhase] = useState<ReviewPhase>('extracting')
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [extractionProgress, setExtractionProgress] = useState<{
    stage: string
    current: number
    total: number
    message: string
  } | null>(null)
  const [discoveredEntities, setDiscoveredEntities] = useState<
    Array<{
      name: string
      type: string
    }>
  >([])

  // Review state
  const [entities, setEntities] = useState<StagedEntity[]>([])
  const [relationships, setRelationships] = useState<StagedRelationship[]>([])
  const [existingMatches, setExistingMatches] = useState<EntityMatch[]>([])
  const [selectedType, setSelectedType] = useState<string | null>(null)

  // Edit modal state
  const [editingEntity, setEditingEntity] = useState<StagedEntity | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)

  // Merge modal state
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergingEntityTempId, setMergingEntityTempId] = useState<string | null>(null)
  const [existingEntities, setExistingEntities] = useState<
    Array<{
      id: string
      name: string
      entityType: string
      aliases: string[] | null
    }>
  >([])
  const [mergeSearch, setMergeSearch] = useState('')
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<string | null>(null)
  const [loadingEntities, setLoadingEntities] = useState(false)

  // Commit result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Start extraction on mount
  useEffect(() => {
    startExtraction()
  }, [])

  // Load existing entities when merge modal opens
  useEffect(() => {
    if (mergeModalOpen && existingEntities.length === 0) {
      loadExistingEntities()
    }
  }, [mergeModalOpen])

  const loadExistingEntities = async () => {
    setLoadingEntities(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities`)
      if (res.ok) {
        const data = await res.json()
        setExistingEntities(data.entities || [])
      }
    } catch (err) {
      console.error('Failed to load entities:', err)
    } finally {
      setLoadingEntities(false)
    }
  }

  const handleOpenMergeDialog = useCallback((tempId: string) => {
    setMergingEntityTempId(tempId)
    setSelectedMergeTarget(null)
    setMergeSearch('')
    setMergeModalOpen(true)
  }, [])

  const handleConfirmMerge = useCallback(() => {
    if (mergingEntityTempId && selectedMergeTarget) {
      handleMerge(mergingEntityTempId, selectedMergeTarget)
      setMergeModalOpen(false)
      setMergingEntityTempId(null)
      setSelectedMergeTarget(null)
    }
  }, [mergingEntityTempId, selectedMergeTarget])

  const filteredExistingEntities = mergeSearch
    ? existingEntities.filter(
        (e) =>
          e.name.toLowerCase().includes(mergeSearch.toLowerCase()) ||
          e.aliases?.some((a) => a.toLowerCase().includes(mergeSearch.toLowerCase()))
      )
    : existingEntities

  // Start extraction with streaming progress
  const startExtraction = async () => {
    setProgressSteps([])
    setExtractionProgress(null)
    setDiscoveredEntities([])

    try {
      setProgressSteps((prev) => [...prev, `Starting extraction for "${entityName}"...`])

      const response = await fetch(
        `/api/campaigns/${campaignId}/entities/${entityId}/extract-stream`,
        { method: 'POST' }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Extraction failed')
      }

      // Process SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response stream')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7)
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6))

              switch (currentEvent) {
                case 'progress':
                  setProgressSteps((prev) => [...prev, data.message])
                  break

                case 'extraction':
                  setExtractionProgress({
                    stage: data.stage,
                    current: data.current,
                    total: data.total,
                    message: data.message,
                  })
                  break

                case 'entity':
                  setDiscoveredEntities((prev) => [...prev, { name: data.name, type: data.type }])
                  break

                case 'error':
                  throw new Error(data.message)

                case 'complete':
                  const result = data as ExtractPreviewResponse
                  setEntities(result.extractedEntities)
                  setRelationships(result.extractedRelationships)
                  setExistingMatches(result.existingEntityMatches)
                  setProgressSteps((prev) => [
                    ...prev,
                    `Extraction complete: ${result.extractedEntities.length} entities`,
                  ])
                  setPhase('review')
                  break
              }
            } catch (e) {
              // Skip invalid JSON
            }
            currentEvent = ''
          }
        }
      }
    } catch (error) {
      console.error('Extraction error:', error)
      setProgressSteps((prev) => [
        ...prev,
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ])
      setExtractionProgress(null)
    }
  }

  // Entity actions
  const handleApprove = useCallback((tempId: string) => {
    setEntities((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, status: 'approved' as const } : e))
    )
  }, [])

  const handleReject = useCallback((tempId: string) => {
    setEntities((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, status: 'rejected' as const } : e))
    )
  }, [])

  const handleEdit = useCallback(
    (tempId: string) => {
      const entity = entities.find((e) => e.tempId === tempId)
      if (entity) {
        setEditingEntity(entity)
        setEditModalOpen(true)
      }
    },
    [entities]
  )

  const handleEditSave = useCallback((tempId: string, updates: Partial<StagedEntity>) => {
    setEntities((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, ...updates, status: 'edited' as const } : e))
    )
  }, [])

  const handleMerge = useCallback((tempId: string, targetId: string) => {
    setEntities((prev) =>
      prev.map((e) =>
        e.tempId === tempId ? { ...e, mergeTargetId: targetId, status: 'approved' as const } : e
      )
    )
  }, [])

  // Bulk actions
  const handleApproveAll = useCallback(() => {
    setEntities((prev) =>
      prev.map((e) => (e.status === 'pending' ? { ...e, status: 'approved' as const } : e))
    )
  }, [])

  const handleRejectAll = useCallback(() => {
    setEntities((prev) =>
      prev.map((e) => (e.status === 'pending' ? { ...e, status: 'rejected' as const } : e))
    )
  }, [])

  const handleResetAll = useCallback(() => {
    setEntities((prev) =>
      prev.map((e) => ({ ...e, status: 'pending' as const, mergeTargetId: undefined }))
    )
  }, [])

  // Commit approved entities
  const handleCommit = async () => {
    setPhase('committing')

    try {
      const approvedEntities = entities.filter(
        (e) => e.status === 'approved' || e.status === 'edited'
      )

      // Build request
      const request: BatchCommitRequest = {
        documentName: `${entityType}: ${entityName}`,
        documentContent: entityContent,
        entities: approvedEntities.map(
          (e): ApprovedEntity => ({
            tempId: e.tempId,
            name: e.name,
            canonicalName: e.canonicalName,
            entityType: e.entityType,
            content: e.content,
            aliases: e.aliases,
            tags: e.tags,
            isDmOnly: false,
            mergeTargetId: e.mergeTargetId,
          })
        ),
        relationships: relationships
          .filter((r) => {
            const approvedTempIds = new Set(approvedEntities.map((e) => e.tempId))
            return (
              approvedTempIds.has(r.sourceEntityTempId) && approvedTempIds.has(r.targetEntityTempId)
            )
          })
          .map(
            (r): ApprovedRelationship => ({
              sourceEntityTempId: r.sourceEntityTempId,
              targetEntityTempId: r.targetEntityTempId,
              relationshipType: r.relationshipType,
              reverseLabel: r.reverseLabel,
            })
          ),
      }

      const response = await fetch(`/api/campaigns/${campaignId}/entities/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Commit failed')
      }

      const result: BatchCommitResponse = await response.json()

      setCommitResult({
        documentId: result.documentId,
        createdCount: result.createdEntities.length,
        mergedCount: result.mergedEntities.length,
        relationshipsCount: result.createdRelationships,
        embeddingsStatus: result.embeddingsStatus,
      })

      setPhase('complete')
    } catch (error) {
      console.error('Commit error:', error)
      alert(error instanceof Error ? error.message : 'Commit failed')
      setPhase('review')
    }
  }

  // Filter entities for display
  const filteredEntities = selectedType
    ? entities.filter((e) => e.entityType === selectedType)
    : entities

  // Get existing match for an entity
  const getMatchForEntity = (tempId: string) =>
    existingMatches.find((m) => m.stagedTempId === tempId)

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        href={`/campaigns/${campaignId}/entities/${entityId}`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to {entityType.replace('_', ' ')}
      </Link>

      {/* Extracting Phase */}
      {phase === 'extracting' && (
        <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Extracting Entities
              </CardTitle>
              <CardDescription>Analyzing: {entityName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress bar for chunk processing */}
              {extractionProgress && extractionProgress.total > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{extractionProgress.message}</span>
                    <span className="font-medium">
                      {extractionProgress.current}/{extractionProgress.total}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{
                        width: `${(extractionProgress.current / extractionProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Processing log */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <p className="font-medium text-xs text-muted-foreground">Activity Log</p>
                <div className="space-y-1 max-h-32 overflow-y-auto text-sm font-mono">
                  {progressSteps.map((step, index) => (
                    <div key={index} className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="text-xs">{step}</span>
                    </div>
                  ))}
                  {extractionProgress && (
                    <div className="flex items-center gap-2 text-primary">
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      <span className="text-xs">{extractionProgress.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live discovered entities */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Discovered Entities
                {discoveredEntities.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {discoveredEntities.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {discoveredEntities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Entities will appear here as they are found...
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {discoveredEntities.map((entity, index) => {
                    const Icon = getEntityTypeIcon(entity.type)
                    const typeColors = getEntityTypeColor(entity.type)
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-2 py-1 px-2 rounded bg-muted/50 animate-in fade-in slide-in-from-left-2 duration-300"
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${typeColors.text}`} />
                        <span className="text-sm truncate flex-1">{entity.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {getEntityTypeLabel(entity.type)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Review Phase */}
      {phase === 'review' && (
        <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Review Extracted Entities
                </CardTitle>
                <CardDescription>
                  Review, edit, or reject entities before adding them to your wiki.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ReviewToolbar
                  entities={entities}
                  selectedType={selectedType}
                  onSelectType={setSelectedType}
                  onApproveAll={handleApproveAll}
                  onRejectAll={handleRejectAll}
                  onResetAll={handleResetAll}
                />

                {/* Entity cards */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredEntities.map((entity) => (
                    <EntityReviewCard
                      key={entity.tempId}
                      entity={entity}
                      existingMatch={getMatchForEntity(entity.tempId)}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onEdit={handleEdit}
                      onMerge={handleMerge}
                      onOpenMergeDialog={handleOpenMergeDialog}
                    />
                  ))}
                </div>

                {filteredEntities.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No entities match the current filter.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Commit panel sidebar */}
          <div className="lg:order-last">
            <CommitPanel
              entities={entities}
              relationships={relationships}
              fileName={`${entityType}: ${entityName}`}
              isCommitting={false}
              onCommit={handleCommit}
            />
          </div>
        </div>
      )}

      {/* Committing Phase */}
      {phase === 'committing' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div>
                <p className="text-lg font-medium">Committing entities...</p>
                <p className="text-muted-foreground">
                  Creating wiki entries and generating embeddings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Phase */}
      {phase === 'complete' && commitResult && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div>
                <p className="text-lg font-medium">Successfully Committed!</p>
                <p className="text-muted-foreground">
                  Created {commitResult.createdCount} new entities
                  {commitResult.mergedCount > 0 && `, merged ${commitResult.mergedCount}`}
                  {commitResult.relationshipsCount > 0 &&
                    `, and ${commitResult.relationshipsCount} relationships`}
                  .
                </p>
                {commitResult.embeddingsStatus && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Search embeddings: {commitResult.embeddingsStatus.succeeded}/
                    {commitResult.embeddingsStatus.total} generated
                    {commitResult.embeddingsStatus.failed > 0 && (
                      <span className="text-amber-600 ml-1">
                        ({commitResult.embeddingsStatus.failed} failed - try reindexing in settings)
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <Link href={`/campaigns/${campaignId}/entities/${entityId}`}>
                  <Button variant="outline">Back to {entityType.replace('_', ' ')}</Button>
                </Link>
                <Link href={`/campaigns/${campaignId}/entities`}>
                  <Button>View Wiki</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Modal */}
      <EntityEditModal
        entity={editingEntity}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSave={handleEditSave}
      />

      {/* Merge Modal */}
      <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge into Existing Entity
            </DialogTitle>
            <DialogDescription>
              Select an existing entity to merge this extracted entity into. The content will be
              added and aliases combined.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entities..."
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Entity list */}
            <div className="max-h-64 overflow-y-auto border rounded-md">
              {loadingEntities ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredExistingEntities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {mergeSearch ? 'No matching entities' : 'No existing entities'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredExistingEntities.map((entity) => {
                    const Icon = getEntityTypeIcon(entity.entityType)
                    const typeClasses = getEntityTypeBadgeClasses(entity.entityType)
                    const isSelected = selectedMergeTarget === entity.id

                    return (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => setSelectedMergeTarget(entity.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors ${
                          isSelected ? 'bg-accent' : ''
                        }`}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate font-medium text-sm">{entity.name}</span>
                        <Badge variant="outline" className={`shrink-0 text-xs ${typeClasses}`}>
                          {getEntityTypeLabel(entity.entityType)}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmMerge} disabled={!selectedMergeTarget}>
              <GitMerge className="mr-2 h-4 w-4" />
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
