'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Upload, FileText, Loader2, CheckCircle, ArrowLeft, Search, GitMerge } from 'lucide-react'
import { EntityReviewCard } from './entity-review-card'
import { EntityEditModal } from './entity-edit-modal'
import { ReviewToolbar } from './review-toolbar'
import { CommitPanel } from './commit-panel'
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

interface DocumentUploadWithReviewProps {
  campaignId: string
}

type ReviewPhase = 'upload' | 'extracting' | 'review' | 'committing' | 'complete'

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

export function DocumentUploadWithReview({ campaignId }: DocumentUploadWithReviewProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Phase management
  const [phase, setPhase] = useState<ReviewPhase>('upload')
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [extractionProgress, setExtractionProgress] = useState<{
    stage: string
    current: number
    total: number
    message: string
  } | null>(null)
  const [discoveredEntities, setDiscoveredEntities] = useState<Array<{
    name: string
    type: string
  }>>([])

  // File state
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')

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
  const [existingEntities, setExistingEntities] = useState<Array<{
    id: string
    name: string
    entityType: string
    aliases: string[] | null
  }>>([])
  const [mergeSearch, setMergeSearch] = useState('')
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<string | null>(null)
  const [loadingEntities, setLoadingEntities] = useState(false)

  // Commit result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

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

  // Handle file upload and extraction with client-side chunking
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    setFileName(file.name)
    setPhase('extracting')
    setProgressSteps([])
    setExtractionProgress(null)
    setDiscoveredEntities([])

    // Read file content for later commit
    const buffer = await file.arrayBuffer()
    const content = new TextDecoder().decode(buffer)
    setFileContent(content)

    try {
      setProgressSteps((prev) => [...prev, `Parsing ${file.name}...`])

      // Step 1: Parse document and get chunks (fast, no AI)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('chunkSize', '3000')

      const parseResponse = await fetch(`/api/campaigns/${campaignId}/documents/parse`, {
        method: 'POST',
        body: formData,
      })

      if (!parseResponse.ok) {
        const data = await parseResponse.json()
        throw new Error(data.error || 'Parse failed')
      }

      const parseResult = await parseResponse.json()
      const { chunks, totalChunks, existingEntityNames, language } = parseResult

      setProgressSteps((prev) => [
        ...prev,
        `Parsed ${parseResult.contentLength.toLocaleString()} characters into ${totalChunks} chunks`,
      ])

      // Step 2: Extract FACTS from each chunk (incremental enrichment)
      const allFacts: Array<{
        subject: string
        subjectType: string
        fact: string
        section: string
        sourceExcerpt: string
        isDmOnly: boolean
        confidence: number
        mentions: Array<{ name: string; type: string; relationship?: string }>
      }> = []
      const allNewEntities: Array<{ name: string; type: string; canonicalName: string }> = []
      const seenEntityNames = new Set<string>()

      for (let i = 0; i < chunks.length; i++) {
        setExtractionProgress({
          stage: 'extracting',
          current: i + 1,
          total: totalChunks,
          message: `Extracting facts from chunk ${i + 1}/${totalChunks}...`,
        })

        try {
          // Use fact-based extraction endpoint
          const chunkResponse = await fetch(`/api/campaigns/${campaignId}/extract-facts/chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chunkContent: chunks[i],
              chunkIndex: i,
              totalChunks,
              language,
              existingEntityNames: [...existingEntityNames, ...Array.from(seenEntityNames)],
              extractionModel: 'claude-3-5-haiku-20241022',
              storeImmediately: false, // Don't store yet, let user review
            }),
          })

          if (!chunkResponse.ok) {
            console.warn(`Chunk ${i + 1} failed, continuing...`)
            continue
          }

          const chunkResult = await chunkResponse.json()

          // Collect facts
          for (const fact of chunkResult.facts || []) {
            allFacts.push(fact)

            // Track seen subjects
            const canonicalName = fact.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            if (!seenEntityNames.has(canonicalName)) {
              seenEntityNames.add(canonicalName)
              // Show discovered entity
              setDiscoveredEntities((prev) => [
                ...prev,
                { name: fact.subject, type: fact.subjectType },
              ])
            }
          }

          // Collect new entities
          for (const newEntity of chunkResult.newEntities || []) {
            if (!seenEntityNames.has(newEntity.canonicalName)) {
              seenEntityNames.add(newEntity.canonicalName)
              allNewEntities.push(newEntity)
            }
          }

          setProgressSteps((prev) => [
            ...prev,
            `Chunk ${i + 1}: Found ${chunkResult.facts?.length || 0} facts`,
          ])

          // Small delay between chunks to avoid rate limiting
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        } catch (chunkError) {
          console.error(`Error processing chunk ${i + 1}:`, chunkError)
          setProgressSteps((prev) => [
            ...prev,
            `Chunk ${i + 1}: Error (skipped)`,
          ])
          // Delay even on error
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Step 3: Group facts by subject to create staged entities
      const factsBySubject = new Map<string, typeof allFacts>()
      for (const fact of allFacts) {
        const canonicalName = fact.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        if (!factsBySubject.has(canonicalName)) {
          factsBySubject.set(canonicalName, [])
        }
        factsBySubject.get(canonicalName)!.push(fact)
      }

      // Convert grouped facts to staged entities
      const allEntities: StagedEntity[] = []
      const allRelationships: StagedRelationship[] = []
      const nameToTempId = new Map<string, string>()

      for (const [canonicalName, facts] of factsBySubject) {
        const firstFact = facts[0]
        const tempId = crypto.randomUUID()

        // Build content from facts grouped by section
        const sections = new Map<string, string[]>()
        for (const fact of facts) {
          if (!sections.has(fact.section)) {
            sections.set(fact.section, [])
          }
          sections.get(fact.section)!.push(fact.fact)
        }

        let content = `# ${firstFact.subject}\n\n`
        const sectionOrder = ['appearance', 'personality', 'abilities', 'possessions', 'location', 'relationships', 'history', 'goals', 'other']
        for (const section of sectionOrder) {
          const sectionFacts = sections.get(section)
          if (sectionFacts && sectionFacts.length > 0) {
            content += `## ${section.charAt(0).toUpperCase() + section.slice(1)}\n`
            for (const f of sectionFacts) {
              content += `- ${f}\n`
            }
            content += '\n'
          }
        }

        const entity: StagedEntity = {
          tempId,
          name: firstFact.subject,
          canonicalName,
          entityType: firstFact.subjectType,
          content: content.trim(),
          aliases: [],
          tags: [firstFact.subjectType],
          confidence: Math.max(...facts.map(f => f.confidence)),
          excerpt: facts.map(f => f.fact).slice(0, 3).join('. '),
          status: 'pending' as const,
        }

        allEntities.push(entity)
        nameToTempId.set(firstFact.subject.toLowerCase(), tempId)
        nameToTempId.set(canonicalName, tempId)

        // Extract relationships from fact mentions
        for (const fact of facts) {
          for (const mention of fact.mentions) {
            if (mention.relationship) {
              allRelationships.push({
                tempId: crypto.randomUUID(),
                sourceEntityTempId: tempId,
                targetEntityTempId: '', // Will be resolved after all entities created
                sourceEntityName: firstFact.subject,
                targetEntityName: mention.name,
                relationshipType: mention.relationship,
                excerpt: fact.sourceExcerpt || fact.fact,
                status: 'pending' as const,
              })
            }
          }
        }
      }

      // Resolve relationship target tempIds
      const resolvedRelationships = allRelationships
        .map((rel) => ({
          ...rel,
          targetEntityTempId: nameToTempId.get(rel.targetEntityName.toLowerCase()) ||
                              nameToTempId.get(rel.targetEntityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || '',
        }))
        .filter((rel) => rel.sourceEntityTempId && rel.targetEntityTempId)

      setProgressSteps((prev) => [
        ...prev,
        `Extraction complete: ${allFacts.length} facts → ${allEntities.length} entities`,
      ])

      // Step 4: Check for duplicates with existing entities
      const existingEntityMatches: EntityMatch[] = []
      const existingEntitiesData = await fetch(`/api/campaigns/${campaignId}/entities`)
        .then((r) => r.json())
        .then((d) => d.entities || [])
        .catch(() => [])

      const canonicalMap = new Map<string, any>()
      for (const entity of existingEntitiesData) {
        canonicalMap.set(entity.canonicalName?.toLowerCase() || '', entity)
      }

      for (const staged of allEntities) {
        const exactMatch = canonicalMap.get(staged.canonicalName.toLowerCase())
        if (exactMatch) {
          existingEntityMatches.push({
            stagedTempId: staged.tempId,
            existingEntity: {
              id: exactMatch.id,
              name: exactMatch.name,
              entityType: exactMatch.entityType,
              aliases: exactMatch.aliases || [],
              canonicalName: exactMatch.canonicalName,
            },
            matchType: 'exact',
            confidence: 1.0,
          })
        }
      }

      // Store facts for commit phase
      ;(window as any).__extractedFacts = allFacts
      ;(window as any).__newEntities = allNewEntities

      setEntities(allEntities)
      setRelationships(resolvedRelationships)
      setExistingMatches(existingEntityMatches)
      setExtractionProgress(null)
      setPhase('review')
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
      prev.map((e) =>
        e.tempId === tempId ? { ...e, status: 'approved' as const } : e
      )
    )
  }, [])

  const handleReject = useCallback((tempId: string) => {
    setEntities((prev) =>
      prev.map((e) =>
        e.tempId === tempId ? { ...e, status: 'rejected' as const } : e
      )
    )
  }, [])

  const handleEdit = useCallback((tempId: string) => {
    const entity = entities.find((e) => e.tempId === tempId)
    if (entity) {
      setEditingEntity(entity)
      setEditModalOpen(true)
    }
  }, [entities])

  const handleEditSave = useCallback((tempId: string, updates: Partial<StagedEntity>) => {
    setEntities((prev) =>
      prev.map((e) =>
        e.tempId === tempId
          ? { ...e, ...updates, status: 'edited' as const }
          : e
      )
    )
  }, [])

  const handleMerge = useCallback((tempId: string, targetId: string) => {
    setEntities((prev) =>
      prev.map((e) =>
        e.tempId === tempId
          ? { ...e, mergeTargetId: targetId, status: 'approved' as const }
          : e
      )
    )
  }, [])

  // Bulk actions
  const handleApproveAll = useCallback(() => {
    setEntities((prev) =>
      prev.map((e) =>
        e.status === 'pending' ? { ...e, status: 'approved' as const } : e
      )
    )
  }, [])

  const handleRejectAll = useCallback(() => {
    setEntities((prev) =>
      prev.map((e) =>
        e.status === 'pending' ? { ...e, status: 'rejected' as const } : e
      )
    )
  }, [])

  const handleResetAll = useCallback(() => {
    setEntities((prev) =>
      prev.map((e) => ({ ...e, status: 'pending' as const, mergeTargetId: undefined }))
    )
  }, [])

  // Commit approved entities using fact-based system
  const handleCommit = async () => {
    setPhase('committing')

    try {
      const approvedEntities = entities.filter(
        (e) => e.status === 'approved' || e.status === 'edited'
      )

      // Get approved canonical names (including merge targets)
      const approvedCanonicalNames = new Set<string>()
      for (const entity of approvedEntities) {
        approvedCanonicalNames.add(entity.canonicalName)
        // If merging into existing, also include the original name
        if (entity.mergeTargetId) {
          const match = existingMatches.find(m => m.stagedTempId === entity.tempId)
          if (match) {
            approvedCanonicalNames.add(match.existingEntity.canonicalName)
          }
        }
      }

      // Get extracted facts from window (stored during extraction)
      const allFacts = (window as any).__extractedFacts || []
      const newEntities = (window as any).__newEntities || []

      // Filter facts to only include those for approved entities
      const approvedFacts = allFacts.filter((fact: any) => {
        const canonicalName = fact.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        return approvedCanonicalNames.has(canonicalName)
      })

      // Filter new entities to only include approved ones
      const approvedNewEntities = newEntities.filter((e: any) =>
        approvedCanonicalNames.has(e.canonicalName)
      )

      // Use fact-based commit endpoint - this will:
      // 1. Create new entities if they don't exist
      // 2. Add facts to existing entities if they do exist
      // 3. Regenerate wiki summaries from accumulated facts
      const response = await fetch(`/api/campaigns/${campaignId}/extract-facts/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facts: approvedFacts,
          newEntities: approvedNewEntities,
          regenerateSummaries: true,
          summaryModel: 'claude-3-5-haiku-20241022',
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Commit failed')
      }

      const result = await response.json()

      setCommitResult({
        documentId: crypto.randomUUID(),
        createdCount: result.createdEntityIds?.length || 0,
        mergedCount: result.updatedEntityIds?.length || 0, // Entities with new facts added
        relationshipsCount: 0,
        embeddingsStatus: undefined,
      })

      // Clean up
      delete (window as any).__extractedFacts
      delete (window as any).__newEntities

      setPhase('complete')
    } catch (error) {
      console.error('Commit error:', error)
      alert(error instanceof Error ? error.message : 'Commit failed')
      setPhase('review')
    }
  }

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
  }

  // Filter entities for display
  const filteredEntities = selectedType
    ? entities.filter((e) => e.entityType === selectedType)
    : entities

  // Get existing match for an entity
  const getMatchForEntity = (tempId: string) =>
    existingMatches.find((m) => m.stagedTempId === tempId)

  // Reset to upload new file
  const handleUploadAnother = () => {
    setPhase('upload')
    setFileName('')
    setFileContent('')
    setEntities([])
    setRelationships([])
    setExistingMatches([])
    setSelectedType(null)
    setCommitResult(null)
    setProgressSteps([])
  }

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        href={`/campaigns/${campaignId}/entities`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to wiki
      </Link>

      {/* Upload Phase */}
      {phase === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Campaign Documents</CardTitle>
            <CardDescription>
              Upload PDF, TXT, or MD files. The AI will extract entities for your review
              before adding them to the wiki.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`
                border-2 border-dashed rounded-lg p-12 text-center transition-colors
                ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
                cursor-pointer hover:border-primary/50
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.markdown,.json"
                onChange={handleChange}
                className="hidden"
              />

              <div className="flex flex-col items-center gap-3">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">
                  Drag & drop a file here, or click to browse
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports PDF, TXT, MD, JSON files
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extracting Phase */}
      {phase === 'extracting' && (
        <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Extracting Entities
              </CardTitle>
              <CardDescription>
                Analyzing {fileName}...
              </CardDescription>
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
                  <FileText className="h-5 w-5" />
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
              fileName={fileName}
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
                    Search embeddings: {commitResult.embeddingsStatus.succeeded}/{commitResult.embeddingsStatus.total} generated
                    {commitResult.embeddingsStatus.failed > 0 && (
                      <span className="text-amber-600 ml-1">
                        ({commitResult.embeddingsStatus.failed} failed - try reindexing in settings)
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={handleUploadAnother}>
                  Upload Another
                </Button>
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
              Select an existing entity to merge this extracted entity into.
              The content will be added and aliases combined.
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
                        <span className="flex-1 truncate font-medium text-sm">
                          {entity.name}
                        </span>
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
