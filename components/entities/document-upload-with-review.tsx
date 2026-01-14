'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileText, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import { EntityReviewCard } from './entity-review-card'
import { EntityEditModal } from './entity-edit-modal'
import { ReviewToolbar } from './review-toolbar'
import { CommitPanel } from './commit-panel'
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
}

export function DocumentUploadWithReview({ campaignId }: DocumentUploadWithReviewProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Phase management
  const [phase, setPhase] = useState<ReviewPhase>('upload')
  const [progressSteps, setProgressSteps] = useState<string[]>([])

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

  // Commit result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Handle file upload and extraction
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0] // Only process first file
    setFileName(file.name)
    setPhase('extracting')
    setProgressSteps([])

    try {
      setProgressSteps((prev) => [...prev, `Processing ${file.name}...`])

      // Read file content for later commit
      const buffer = await file.arrayBuffer()
      const content = new TextDecoder().decode(buffer)
      setFileContent(content)

      setProgressSteps((prev) => [...prev, 'Sending to extraction API...'])

      // Send to extract-only endpoint
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/campaigns/${campaignId}/documents/extract`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Extraction failed')
      }

      const data: ExtractPreviewResponse = await response.json()

      setProgressSteps((prev) => [
        ...prev,
        `Extracted ${data.extractedEntities.length} entities`,
        `Found ${data.extractedRelationships.length} relationships`,
      ])

      if (data.existingEntityMatches.length > 0) {
        setProgressSteps((prev) => [
          ...prev,
          `Detected ${data.existingEntityMatches.length} potential duplicates`,
        ])
      }

      // Store extracted data
      setEntities(data.extractedEntities)
      setRelationships(data.extractedRelationships)
      setExistingMatches(data.existingEntityMatches)

      setPhase('review')
    } catch (error) {
      console.error('Extraction error:', error)
      setProgressSteps((prev) => [
        ...prev,
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ])
      // Stay in extracting phase to show error
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

  // Commit approved entities
  const handleCommit = async () => {
    setPhase('committing')

    try {
      const approvedEntities = entities.filter(
        (e) => e.status === 'approved' || e.status === 'edited'
      )

      // Build request
      const request: BatchCommitRequest = {
        documentName: fileName,
        documentContent: fileContent,
        entities: approvedEntities.map((e): ApprovedEntity => ({
          tempId: e.tempId,
          name: e.name,
          canonicalName: e.canonicalName,
          entityType: e.entityType,
          content: e.content,
          aliases: e.aliases,
          tags: e.tags,
          isDmOnly: false, // Default for AI extraction
          mergeTargetId: e.mergeTargetId,
        })),
        relationships: relationships
          .filter((r) => {
            const approvedTempIds = new Set(approvedEntities.map((e) => e.tempId))
            return (
              approvedTempIds.has(r.sourceEntityTempId) &&
              approvedTempIds.has(r.targetEntityTempId)
            )
          })
          .map((r): ApprovedRelationship => ({
            sourceEntityTempId: r.sourceEntityTempId,
            targetEntityTempId: r.targetEntityTempId,
            relationshipType: r.relationshipType,
            reverseLabel: r.reverseLabel,
          })),
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
      })

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Extracting Entities
            </CardTitle>
            <CardDescription>
              Analyzing {fileName} and extracting entities...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="font-medium text-sm">Processing Log:</p>
              <div className="space-y-1 max-h-48 overflow-y-auto text-sm font-mono">
                {progressSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs text-muted-foreground/50">[{index + 1}]</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
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
    </div>
  )
}
