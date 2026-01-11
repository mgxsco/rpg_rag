'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileText, Loader2, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface DocumentUploadProps {
  campaignId: string
}

interface EntityResult {
  id: string
  name: string
  type: string
}

interface RelationshipResult {
  source: string
  target: string
  type: string
}

interface UploadResult {
  file: string
  success: boolean
  error?: string
  documentId?: string
  entitiesCreated?: number
  entities?: EntityResult[]
  relationshipsCreated?: number
  relationships?: RelationshipResult[]
}

export function DocumentUpload({ campaignId }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploading(true)
    setResults([])
    setProgressSteps([])
    setStatusMessage('Uploading files...')

    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    try {
      setProgressSteps(prev => [...prev, `Uploading ${files.length} file(s)...`])
      setStatusMessage('Parsing document...')
      setProgressSteps(prev => [...prev, 'Parsing document content...'])

      const res = await fetch(`/api/campaigns/${campaignId}/documents`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      // Add progress from server if available
      if (data.progress) {
        setProgressSteps(prev => [...prev, ...data.progress])
      }

      setResults(data.results)
      setStatusMessage('Complete!')
      setProgressSteps(prev => [...prev, `Created ${data.results.reduce((sum: number, r: UploadResult) => sum + (r.entitiesCreated || 0), 0)} entities`])

      // Refresh the page after a short delay
      setTimeout(() => {
        router.refresh()
      }, 1500)
    } catch (error) {
      setProgressSteps(prev => [...prev, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`])
      setResults([
        {
          file: 'Upload',
          success: false,
          error: error instanceof Error ? error.message : 'Something went wrong',
        },
      ])
    } finally {
      setUploading(false)
    }
  }

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

  const totalEntities = results.reduce((sum, r) => sum + (r.entitiesCreated || 0), 0)
  const totalRelationships = results.reduce((sum, r) => sum + (r.relationshipsCreated || 0), 0)

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/campaigns/${campaignId}/entities`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to wiki
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Upload Campaign Documents</CardTitle>
          <CardDescription>
            Upload PDF, TXT, or MD files. The AI will automatically extract NPCs, locations,
            items, quests, and other entities, creating wiki pages and relationships.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
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
              multiple
              accept=".pdf,.txt,.md,.markdown,.json"
              onChange={handleChange}
              className="hidden"
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{statusMessage}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">
                  Drag & drop files here, or click to browse
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports PDF, TXT, MD, JSON files
                </p>
              </div>
            )}
          </div>

          {/* Progress steps */}
          {progressSteps.length > 0 && (
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
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium text-lg">
                  Extraction Complete
                </p>
                <p className="text-muted-foreground">
                  Created {totalEntities} entities and {totalRelationships} relationships
                </p>
              </div>

              <div className="space-y-3">
                {results.map((result, index) => (
                  <Card key={index} className={result.success ? '' : 'border-red-500/50'}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        {result.success ? (
                          <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{result.file}</p>
                          {result.success ? (
                            <div className="text-sm text-muted-foreground mt-1">
                              <p>
                                {result.entitiesCreated} entities, {result.relationshipsCreated} relationships
                              </p>
                              {result.entities && result.entities.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {result.entities.slice(0, 5).map((entity, i) => (
                                    <Link
                                      key={i}
                                      href={`/campaigns/${campaignId}/entities/${entity.id}`}
                                      className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded hover:bg-primary/20"
                                    >
                                      {entity.name}
                                    </Link>
                                  ))}
                                  {result.entities.length > 5 && (
                                    <span className="text-xs text-muted-foreground px-2 py-0.5">
                                      +{result.entities.length - 5} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-red-500 mt-1">{result.error}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Link href={`/campaigns/${campaignId}/entities`}>
                  <Button>View Wiki</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
