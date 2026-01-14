'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import {
  Sparkles,
  Loader2,
  CheckCircle,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  GitMerge,
  Search,
} from 'lucide-react'
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

interface ExtractEntitiesButtonProps {
  campaignId: string
  noteSlug: string
  noteTitle: string
  noteContent?: string
}

type Phase = 'idle' | 'extracting' | 'review' | 'committing' | 'complete'

export function ExtractEntitiesButton({
  campaignId,
  noteSlug,
  noteTitle,
  noteContent = '',
}: ExtractEntitiesButtonProps) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const { toast } = useToast()

  // Extraction progress
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [extractionProgress, setExtractionProgress] = useState<{
    stage: string
    current: number
    total: number
    message: string
  } | null>(null)

  // Review state
  const [entities, setEntities] = useState<StagedEntity[]>([])
  const [relationships, setRelationships] = useState<StagedRelationship[]>([])
  const [existingMatches, setExistingMatches] = useState<EntityMatch[]>([])
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)

  // Merge modal state
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergingEntityTempId, setMergingEntityTempId] = useState<string | null>(null)
  const [existingEntities, setExistingEntities] = useState<
    Array<{ id: string; name: string; entityType: string; aliases: string[] | null }>
  >([])
  const [mergeSearch, setMergeSearch] = useState('')
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<string | null>(null)

  // Commit result
  const [commitResult, setCommitResult] = useState<{
    createdCount: number
    mergedCount: number
    relationshipsCount: number
  } | null>(null)

  // Load existing entities when merge modal opens
  useEffect(() => {
    if (mergeModalOpen && existingEntities.length === 0) {
      loadExistingEntities()
    }
  }, [mergeModalOpen])

  const loadExistingEntities = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities`)
      if (res.ok) {
        const data = await res.json()
        setExistingEntities(data.entities || [])
      }
    } catch (err) {
      console.error('Failed to load entities:', err)
    }
  }

  const handleExtract = async () => {
    setPhase('extracting')
    setProgressSteps([])
    setExtractionProgress(null)
    setEntities([])
    setRelationships([])
    setExistingMatches([])

    try {
      setProgressSteps(['Starting extraction...'])

      const response = await fetch(
        `/api/campaigns/${campaignId}/notes/${noteSlug}/extract-stream`,
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

                case 'error':
                  throw new Error(data.message)

                case 'complete':
                  const result = data as ExtractPreviewResponse
                  setEntities(result.extractedEntities)
                  setRelationships(result.extractedRelationships)
                  setExistingMatches(result.existingEntityMatches)
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
      toast({
        title: 'Extraction Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
      setPhase('idle')
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

  const handleUndo = useCallback((tempId: string) => {
    setEntities((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, status: 'pending' as const } : e))
    )
  }, [])

  const handleMerge = useCallback((tempId: string, targetId: string) => {
    setEntities((prev) =>
      prev.map((e) =>
        e.tempId === tempId ? { ...e, mergeTargetId: targetId, status: 'approved' as const } : e
      )
    )
  }, [])

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
    }
  }, [mergingEntityTempId, selectedMergeTarget, handleMerge])

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

  // Commit
  const handleCommit = async () => {
    setPhase('committing')

    try {
      const approvedEntities = entities.filter(
        (e) => e.status === 'approved' || e.status === 'edited'
      )

      const request: BatchCommitRequest = {
        documentName: `Note: ${noteTitle}`,
        documentContent: noteContent,
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
        createdCount: result.createdEntities.length,
        mergedCount: result.mergedEntities.length,
        relationshipsCount: result.createdRelationships,
      })

      setPhase('complete')

      toast({
        title: 'Entities Added',
        description: `Created ${result.createdEntities.length} entities${
          result.mergedEntities.length > 0 ? `, merged ${result.mergedEntities.length}` : ''
        }`,
      })
    } catch (error) {
      console.error('Commit error:', error)
      toast({
        title: 'Commit Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
      setPhase('review')
    }
  }

  const handleClose = () => {
    setOpen(false)
    // Reset state after dialog closes
    setTimeout(() => {
      setPhase('idle')
      setProgressSteps([])
      setExtractionProgress(null)
      setEntities([])
      setRelationships([])
      setExistingMatches([])
      setCommitResult(null)
    }, 200)
  }

  // Get match for entity
  const getMatchForEntity = (tempId: string) =>
    existingMatches.find((m) => m.stagedTempId === tempId)

  // Stats
  const approvedCount = entities.filter(
    (e) => e.status === 'approved' || e.status === 'edited'
  ).length
  const pendingCount = entities.filter((e) => e.status === 'pending').length
  const rejectedCount = entities.filter((e) => e.status === 'rejected').length

  const filteredMergeEntities = mergeSearch
    ? existingEntities.filter(
        (e) =>
          e.name.toLowerCase().includes(mergeSearch.toLowerCase()) ||
          e.aliases?.some((a) => a.toLowerCase().includes(mergeSearch.toLowerCase()))
      )
    : existingEntities

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Sparkles className="h-4 w-4 mr-1" />
            Extract Entities
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {phase === 'idle' && 'Extract Entities from Note'}
              {phase === 'extracting' && 'Extracting...'}
              {phase === 'review' && 'Review Extracted Entities'}
              {phase === 'committing' && 'Adding Entities...'}
              {phase === 'complete' && 'Complete!'}
            </DialogTitle>
            <DialogDescription>
              {phase === 'idle' &&
                `AI will analyze "${noteTitle}" and extract entities for your review.`}
              {phase === 'extracting' && 'Analyzing note content...'}
              {phase === 'review' && 'Approve, reject, or edit entities before adding to wiki.'}
              {phase === 'committing' && 'Creating wiki entries...'}
              {phase === 'complete' && 'Entities have been added to your wiki.'}
            </DialogDescription>
          </DialogHeader>

          {/* Idle - Start Button */}
          {phase === 'idle' && (
            <div className="py-4 text-sm text-muted-foreground">
              <p>This will:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Analyze the note content using AI</li>
                <li>Extract named entities (NPCs, locations, items, etc.)</li>
                <li>Let you review before adding to wiki</li>
              </ul>
            </div>
          )}

          {/* Extracting - Progress */}
          {phase === 'extracting' && (
            <div className="py-4 space-y-4">
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

              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="font-medium text-xs text-muted-foreground">Progress</p>
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
            </div>
          )}

          {/* Review - Entity List */}
          {phase === 'review' && (
            <div className="flex-1 min-h-0 flex flex-col gap-3">
              {/* Stats bar */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Found {entities.length} entities:</span>
                {approvedCount > 0 && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                    {approvedCount} approved
                  </Badge>
                )}
                {pendingCount > 0 && (
                  <Badge variant="outline">{pendingCount} pending</Badge>
                )}
                {rejectedCount > 0 && (
                  <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                    {rejectedCount} rejected
                  </Badge>
                )}
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" onClick={handleApproveAll} className="h-7 text-xs">
                    Approve All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRejectAll} className="h-7 text-xs">
                    Reject All
                  </Button>
                </div>
              </div>

              {/* Entity list */}
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-2 pb-2">
                  {entities.map((entity) => {
                    const Icon = getEntityTypeIcon(entity.entityType)
                    const typeColors = getEntityTypeColor(entity.entityType)
                    const match = getMatchForEntity(entity.tempId)
                    const isExpanded = expandedEntity === entity.tempId
                    const isRejected = entity.status === 'rejected'
                    const isApproved = entity.status === 'approved' || entity.status === 'edited'

                    return (
                      <div
                        key={entity.tempId}
                        className={`border rounded-lg overflow-hidden transition-colors ${
                          isRejected
                            ? 'opacity-50 bg-muted/30'
                            : isApproved
                            ? 'border-green-500/50 bg-green-500/5'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 p-2">
                          <Icon className={`h-4 w-4 shrink-0 ${typeColors.text}`} />
                          <span className="font-medium text-sm flex-1 truncate">{entity.name}</span>
                          <Badge variant="outline" className={`text-xs ${getEntityTypeBadgeClasses(entity.entityType)}`}>
                            {getEntityTypeLabel(entity.entityType)}
                          </Badge>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1">
                            {isRejected ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleUndo(entity.tempId)}
                                title="Undo"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-7 w-7 ${isApproved ? 'text-green-600' : ''}`}
                                  onClick={() => handleApprove(entity.tempId)}
                                  title="Approve"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleReject(entity.tempId)}
                                  title="Reject"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setExpandedEntity(isExpanded ? null : entity.tempId)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Duplicate warning */}
                        {match && !entity.mergeTargetId && (
                          <div className="px-2 pb-2">
                            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded px-2 py-1">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span className="flex-1">
                                Possible duplicate of "{match.existingEntity.name}"
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => handleMerge(entity.tempId, match.existingEntity.id)}
                              >
                                <GitMerge className="h-3 w-3 mr-1" />
                                Merge
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Manual merge option */}
                        {!match && !entity.mergeTargetId && (
                          <div className="px-2 pb-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-muted-foreground"
                              onClick={() => handleOpenMergeDialog(entity.tempId)}
                            >
                              <GitMerge className="h-3 w-3 mr-1" />
                              Merge into existing...
                            </Button>
                          </div>
                        )}

                        {/* Merged indicator */}
                        {entity.mergeTargetId && (
                          <div className="px-2 pb-2">
                            <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-500/10 rounded px-2 py-1">
                              <GitMerge className="h-3.5 w-3.5 shrink-0" />
                              <span>Will merge into existing entity</span>
                            </div>
                          </div>
                        )}

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="px-2 pb-2 border-t bg-muted/30">
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-4">
                              {entity.content}
                            </p>
                            {entity.aliases.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <span className="font-medium">Aliases:</span> {entity.aliases.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Committing */}
          {phase === 'committing' && (
            <div className="py-8 flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Creating wiki entries...</p>
            </div>
          )}

          {/* Complete */}
          {phase === 'complete' && commitResult && (
            <div className="py-8 flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <div>
                <p className="font-medium">Successfully Added!</p>
                <p className="text-sm text-muted-foreground">
                  Created {commitResult.createdCount} entities
                  {commitResult.mergedCount > 0 && `, merged ${commitResult.mergedCount}`}
                  {commitResult.relationshipsCount > 0 &&
                    `, ${commitResult.relationshipsCount} relationships`}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            {phase === 'idle' && (
              <>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleExtract}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Extract
                </Button>
              </>
            )}

            {phase === 'extracting' && (
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            )}

            {phase === 'review' && (
              <>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleCommit} disabled={approvedCount === 0}>
                  <Check className="h-4 w-4 mr-2" />
                  Add {approvedCount} Entities
                </Button>
              </>
            )}

            {phase === 'complete' && <Button onClick={handleClose}>Done</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge into Existing Entity
            </DialogTitle>
            <DialogDescription>
              Select an existing entity to merge into.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entities..."
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-64 overflow-y-auto border rounded-md">
              {filteredMergeEntities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {mergeSearch ? 'No matching entities' : 'No existing entities'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredMergeEntities.map((entity) => {
                    const Icon = getEntityTypeIcon(entity.entityType)
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
                        <Badge variant="outline" className="shrink-0 text-xs">
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
    </>
  )
}
