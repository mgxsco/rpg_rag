'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Loader2,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  SkipForward,
  Sparkles,
  GitBranch,
  FileText,
  Check,
  X,
  Edit2,
} from 'lucide-react'
import { EntityReviewCard } from '@/components/entities/entity-review-card'
import { EntityEditModal } from '@/components/entities/entity-edit-modal'
import { ReviewToolbar } from '@/components/entities/review-toolbar'
import { CommitPanel } from '@/components/entities/commit-panel'
import { RelationshipReviewCard } from '@/components/extraction/relationship-review-card'
import {
  getEntityTypeIcon,
  getEntityTypeColor,
  getEntityTypeLabel,
} from '@/lib/entity-colors'
import type {
  StagedEntity,
  StagedRelationship,
  EntityMatch,
  BatchCommitRequest,
  BatchCommitResponse,
  ApprovedEntity,
  ApprovedRelationship,
} from '@/lib/types'

interface SteppedExtractionWizardProps {
  campaignId: string
  content: string
  title: string
  sourceType: 'note' | 'entity' | 'document'
  sourceId?: string
  backUrl: string
  backLabel: string
}

type WizardPhase =
  | 'initializing'
  | 'chunk-extracting'
  | 'chunk-review'
  | 'entity-review'
  | 'relationship-extracting'
  | 'relationship-review'
  | 'committing'
  | 'complete'

interface ChunkInfo {
  index: number
  length: number
  preview: string
  content: string
}

interface ExtractionSession {
  sessionId: string
  title: string
  language: string
  totalChunks: number
  chunks: ChunkInfo[]
  settings: {
    chunkSize: number
    aggressiveness: string
    confidenceThreshold: number
    enableRelationships: boolean
    extractionModel: string
  }
  existingEntityNames: string[]
}

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

export function SteppedExtractionWizard({
  campaignId,
  content,
  title,
  sourceType,
  sourceId,
  backUrl,
  backLabel,
}: SteppedExtractionWizardProps) {
  const router = useRouter()

  // Session state
  const [session, setSession] = useState<ExtractionSession | null>(null)
  const [phase, setPhase] = useState<WizardPhase>('initializing')
  const [error, setError] = useState<string | null>(null)

  // Chunk processing state
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [isAutoMode, setIsAutoMode] = useState(true)
  const [isPaused, setIsPaused] = useState(false)

  // Entity state (per chunk, then merged)
  const [chunkEntities, setChunkEntities] = useState<Map<number, StagedEntity[]>>(new Map())
  const [rawRelationships, setRawRelationships] = useState<any[][]>([])
  const [allEntities, setAllEntities] = useState<StagedEntity[]>([])
  const [relationships, setRelationships] = useState<StagedRelationship[]>([])
  const [existingMatches, setExistingMatches] = useState<EntityMatch[]>([])

  // UI state
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [editingEntity, setEditingEntity] = useState<StagedEntity | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)

  // Commit result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Initialize on mount
  useEffect(() => {
    initializeExtraction()
  }, [])

  // Auto-continue chunk extraction
  useEffect(() => {
    if (
      phase === 'chunk-review' &&
      isAutoMode &&
      !isPaused &&
      session &&
      currentChunkIndex < session.totalChunks - 1
    ) {
      // Small delay before auto-continuing
      const timer = setTimeout(() => {
        continueToNextChunk()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [phase, isAutoMode, isPaused, currentChunkIndex, session])

  // Initialize extraction session
  const initializeExtraction = async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/extract-step/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title, sourceType, sourceId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to initialize extraction')
      }

      const data = await response.json()
      setSession(data)
      setPhase('chunk-extracting')

      // Start extracting first chunk
      extractChunk(0, data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed')
    }
  }

  // Extract entities from a single chunk
  const extractChunk = async (chunkIndex: number, sessionData?: ExtractionSession) => {
    const currentSession = sessionData || session
    if (!currentSession) return

    setPhase('chunk-extracting')
    setCurrentChunkIndex(chunkIndex)

    try {
      const chunk = currentSession.chunks[chunkIndex]

      const response = await fetch(`/api/campaigns/${campaignId}/extract-step/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunkContent: chunk.content,
          chunkIndex,
          totalChunks: currentSession.totalChunks,
          language: currentSession.language,
          existingEntityNames: currentSession.existingEntityNames,
          settings: currentSession.settings,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Chunk extraction failed')
      }

      const data = await response.json()

      // Store chunk entities
      setChunkEntities((prev) => {
        const newMap = new Map(prev)
        newMap.set(chunkIndex, data.entities)
        return newMap
      })

      // Store raw relationships for later
      if (data.rawRelationships) {
        setRawRelationships((prev) => {
          const newArr = [...prev]
          newArr[chunkIndex] = data.rawRelationships
          return newArr
        })
      }

      setPhase('chunk-review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    }
  }

  // Continue to next chunk
  const continueToNextChunk = () => {
    if (!session) return

    if (currentChunkIndex < session.totalChunks - 1) {
      extractChunk(currentChunkIndex + 1)
    } else {
      // All chunks processed, merge entities
      mergeAndReviewEntities()
    }
  }

  // Merge all chunk entities for final review
  const mergeAndReviewEntities = () => {
    const merged: StagedEntity[] = []
    const seenNames = new Set<string>()

    chunkEntities.forEach((entities) => {
      for (const entity of entities) {
        if (entity.status === 'rejected') continue

        const key = entity.name.toLowerCase()
        if (seenNames.has(key)) {
          // Merge with existing
          const existing = merged.find((e) => e.name.toLowerCase() === key)
          if (existing) {
            // Combine aliases
            for (const alias of entity.aliases) {
              if (!existing.aliases.includes(alias)) {
                existing.aliases.push(alias)
              }
            }
            // Combine content if different
            if (entity.content && !existing.content.includes(entity.content)) {
              existing.content += '\n\n' + entity.content
            }
          }
        } else {
          seenNames.add(key)
          merged.push({ ...entity })
        }
      }
    })

    setAllEntities(merged)
    setPhase('entity-review')
  }

  // Extract relationships
  const extractRelationships = async () => {
    setPhase('relationship-extracting')

    try {
      const acceptedEntities = allEntities.filter(
        (e) => e.status === 'approved' || e.status === 'edited'
      )

      const response = await fetch(`/api/campaigns/${campaignId}/extract-step/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedEntities,
          rawRelationships,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Relationship extraction failed')
      }

      const data = await response.json()
      setRelationships(data.relationships)
      setPhase('relationship-review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relationship extraction failed')
    }
  }

  // Skip relationships
  const skipRelationships = () => {
    setRelationships([])
    handleCommit()
  }

  // Entity actions for current chunk
  const handleChunkEntityApprove = useCallback((tempId: string) => {
    setChunkEntities((prev) => {
      const newMap = new Map(prev)
      const entities = newMap.get(currentChunkIndex) || []
      newMap.set(
        currentChunkIndex,
        entities.map((e) => (e.tempId === tempId ? { ...e, status: 'approved' as const } : e))
      )
      return newMap
    })
  }, [currentChunkIndex])

  const handleChunkEntityReject = useCallback((tempId: string) => {
    setChunkEntities((prev) => {
      const newMap = new Map(prev)
      const entities = newMap.get(currentChunkIndex) || []
      newMap.set(
        currentChunkIndex,
        entities.map((e) => (e.tempId === tempId ? { ...e, status: 'rejected' as const } : e))
      )
      return newMap
    })
  }, [currentChunkIndex])

  // Entity actions for all entities review
  const handleApprove = useCallback((tempId: string) => {
    setAllEntities((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, status: 'approved' as const } : e))
    )
  }, [])

  const handleReject = useCallback((tempId: string) => {
    setAllEntities((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, status: 'rejected' as const } : e))
    )
  }, [])

  const handleEdit = useCallback(
    (tempId: string) => {
      const entity = allEntities.find((e) => e.tempId === tempId)
      if (entity) {
        setEditingEntity(entity)
        setEditModalOpen(true)
      }
    },
    [allEntities]
  )

  const handleEditSave = useCallback((tempId: string, updates: Partial<StagedEntity>) => {
    setAllEntities((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, ...updates, status: 'edited' as const } : e))
    )
  }, [])

  const handleMerge = useCallback((tempId: string, targetId: string) => {
    setAllEntities((prev) =>
      prev.map((e) =>
        e.tempId === tempId ? { ...e, mergeTargetId: targetId, status: 'approved' as const } : e
      )
    )
  }, [])

  // Bulk actions
  const handleApproveAll = useCallback(() => {
    setAllEntities((prev) =>
      prev.map((e) => (e.status === 'pending' ? { ...e, status: 'approved' as const } : e))
    )
  }, [])

  const handleRejectAll = useCallback(() => {
    setAllEntities((prev) =>
      prev.map((e) => (e.status === 'pending' ? { ...e, status: 'rejected' as const } : e))
    )
  }, [])

  const handleResetAll = useCallback(() => {
    setAllEntities((prev) =>
      prev.map((e) => ({ ...e, status: 'pending' as const, mergeTargetId: undefined }))
    )
  }, [])

  // Relationship actions
  const handleRelationshipApprove = useCallback((tempId: string) => {
    setRelationships((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, status: 'approved' as const } : r))
    )
  }, [])

  const handleRelationshipReject = useCallback((tempId: string) => {
    setRelationships((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, status: 'rejected' as const } : r))
    )
  }, [])

  const handleApproveAllRelationships = useCallback(() => {
    setRelationships((prev) =>
      prev.map((r) => (r.status === 'pending' ? { ...r, status: 'approved' as const } : r))
    )
  }, [])

  const handleRejectAllRelationships = useCallback(() => {
    setRelationships((prev) =>
      prev.map((r) => (r.status === 'pending' ? { ...r, status: 'rejected' as const } : r))
    )
  }, [])

  // Commit
  const handleCommit = async () => {
    setPhase('committing')

    try {
      const approvedEntities = allEntities.filter(
        (e) => e.status === 'approved' || e.status === 'edited'
      )

      const approvedRelationships = relationships.filter(
        (r) => r.status === 'approved'
      )

      const request: BatchCommitRequest = {
        documentName: `${sourceType === 'note' ? 'Note' : sourceType === 'entity' ? 'Entity' : 'Document'}: ${title}`,
        documentContent: content,
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
        relationships: approvedRelationships
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
      setPhase('relationship-review')
    }
  }

  // Current chunk entities
  const currentChunkEntities = chunkEntities.get(currentChunkIndex) || []

  // Filtered entities for display
  const filteredEntities = selectedType
    ? allEntities.filter((e) => e.entityType === selectedType)
    : allEntities

  // Progress calculation
  const progressPercent = session
    ? ((currentChunkIndex + (phase === 'chunk-review' ? 1 : 0)) / session.totalChunks) * 100
    : 0

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        href={backUrl}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {backLabel}
      </Link>

      {/* Error display */}
      {error && (
        <Card className="mb-4 border-destructive">
          <CardContent className="py-4">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-2" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress indicator */}
      {session && phase !== 'complete' && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant={phase.includes('chunk') ? 'default' : 'secondary'}>
                  Chunks: {Math.min(currentChunkIndex + 1, session.totalChunks)}/{session.totalChunks}
                </Badge>
                <Badge variant={phase === 'entity-review' ? 'default' : 'secondary'}>
                  Entities
                </Badge>
                <Badge variant={phase.includes('relationship') ? 'default' : 'secondary'}>
                  Relationships
                </Badge>
              </div>
              {phase.includes('chunk') && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPaused(!isPaused)}
                    disabled={!isAutoMode}
                  >
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAutoMode(!isAutoMode)}
                  >
                    {isAutoMode ? 'Auto' : 'Manual'}
                  </Button>
                </div>
              )}
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Initializing Phase */}
      {phase === 'initializing' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div>
                <p className="text-lg font-medium">Initializing Extraction</p>
                <p className="text-muted-foreground">Analyzing content and preparing chunks...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chunk Extracting Phase */}
      {phase === 'chunk-extracting' && session && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Extracting Chunk {currentChunkIndex + 1}/{session.totalChunks}
            </CardTitle>
            <CardDescription>
              Processing {session.chunks[currentChunkIndex]?.length.toLocaleString()} characters...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4 text-sm font-mono text-muted-foreground">
              {session.chunks[currentChunkIndex]?.preview}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chunk Review Phase */}
      {phase === 'chunk-review' && session && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Chunk {currentChunkIndex + 1}/{session.totalChunks} - Found {currentChunkEntities.length} Entities
                </span>
                {isAutoMode && !isPaused && (
                  <Badge variant="outline" className="animate-pulse">
                    Auto-continuing...
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Review entities from this chunk. {isAutoMode ? 'Click Pause to stop and review.' : 'Click Continue when ready.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    currentChunkEntities.forEach((e) => {
                      if (e.status === 'pending') handleChunkEntityApprove(e.tempId)
                    })
                  }}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    currentChunkEntities.forEach((e) => {
                      if (e.status === 'pending') handleChunkEntityReject(e.tempId)
                    })
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject All
                </Button>
              </div>

              {/* Entity list */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {currentChunkEntities.map((entity) => {
                  const Icon = getEntityTypeIcon(entity.entityType)
                  const colors = getEntityTypeColor(entity.entityType)
                  const isApproved = entity.status === 'approved' || entity.status === 'edited'
                  const isRejected = entity.status === 'rejected'

                  return (
                    <div
                      key={entity.tempId}
                      className={`flex items-center gap-2 p-3 rounded-lg border ${
                        isApproved
                          ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                          : isRejected
                          ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800 opacity-50'
                          : 'bg-card'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{entity.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {getEntityTypeLabel(entity.entityType)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleChunkEntityApprove(entity.tempId)}
                          disabled={isApproved}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleChunkEntityReject(entity.tempId)}
                          disabled={isRejected}
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {currentChunkEntities.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No entities found in this chunk.
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsPaused(true)
                    if (currentChunkIndex > 0) {
                      setCurrentChunkIndex(currentChunkIndex - 1)
                    }
                  }}
                  disabled={currentChunkIndex === 0}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous Chunk
                </Button>

                {currentChunkIndex < session.totalChunks - 1 ? (
                  <Button onClick={continueToNextChunk}>
                    Next Chunk
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button onClick={mergeAndReviewEntities}>
                    Review All Entities
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Entity Review Phase */}
      {phase === 'entity-review' && (
        <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Review All Entities ({allEntities.length})
                </CardTitle>
                <CardDescription>
                  Final review of all extracted entities before relationship extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ReviewToolbar
                  entities={allEntities}
                  selectedType={selectedType}
                  onSelectType={setSelectedType}
                  onApproveAll={handleApproveAll}
                  onRejectAll={handleRejectAll}
                  onResetAll={handleResetAll}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredEntities.map((entity) => (
                    <EntityReviewCard
                      key={entity.tempId}
                      entity={entity}
                      existingMatch={existingMatches.find((m) => m.stagedTempId === entity.tempId)}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onEdit={handleEdit}
                      onMerge={handleMerge}
                      onOpenMergeDialog={() => {}}
                    />
                  ))}
                </div>

                {filteredEntities.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No entities match the current filter.
                  </div>
                )}

                {/* Next step */}
                <div className="flex items-center justify-end pt-4 border-t gap-2">
                  <Button variant="outline" onClick={skipRelationships}>
                    Skip Relationships
                  </Button>
                  <Button
                    onClick={extractRelationships}
                    disabled={allEntities.filter((e) => e.status === 'approved' || e.status === 'edited').length === 0}
                  >
                    <GitBranch className="h-4 w-4 mr-2" />
                    Extract Relationships
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:order-last">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">{allEntities.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved</span>
                    <span className="font-medium text-green-600">
                      {allEntities.filter((e) => e.status === 'approved' || e.status === 'edited').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rejected</span>
                    <span className="font-medium text-red-600">
                      {allEntities.filter((e) => e.status === 'rejected').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-medium text-amber-600">
                      {allEntities.filter((e) => e.status === 'pending').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Relationship Extracting Phase */}
      {phase === 'relationship-extracting' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div>
                <p className="text-lg font-medium">Extracting Relationships</p>
                <p className="text-muted-foreground">
                  Finding connections between {allEntities.filter((e) => e.status === 'approved' || e.status === 'edited').length} entities...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Relationship Review Phase */}
      {phase === 'relationship-review' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Review Relationships ({relationships.length})
              </CardTitle>
              <CardDescription>
                Review extracted relationships between entities.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick actions */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleApproveAllRelationships}>
                  <Check className="h-4 w-4 mr-1" />
                  Approve All
                </Button>
                <Button variant="outline" size="sm" onClick={handleRejectAllRelationships}>
                  <X className="h-4 w-4 mr-1" />
                  Reject All
                </Button>
              </div>

              {/* Relationship list */}
              <div className="space-y-2">
                {relationships.map((rel) => (
                  <RelationshipReviewCard
                    key={rel.tempId}
                    relationship={rel}
                    onApprove={handleRelationshipApprove}
                    onReject={handleRelationshipReject}
                  />
                ))}
              </div>

              {relationships.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No relationships found between entities.
                </div>
              )}

              {/* Commit */}
              <div className="flex items-center justify-end pt-4 border-t">
                <Button onClick={handleCommit}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Commit {allEntities.filter((e) => e.status === 'approved' || e.status === 'edited').length} Entities &{' '}
                  {relationships.filter((r) => r.status === 'approved').length} Relationships
                </Button>
              </div>
            </CardContent>
          </Card>
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
              </div>
              <div className="flex gap-3 mt-4">
                <Link href={backUrl}>
                  <Button variant="outline">{backLabel}</Button>
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
    </div>
  )
}
