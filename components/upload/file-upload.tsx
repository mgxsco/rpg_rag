'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Upload, FileText, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface FileUploadProps {
  campaignId: string
  onUploadComplete?: () => void
}

interface UploadResult {
  file: string
  success: boolean
  error?: string
  noteId?: string
  slug?: string
  title?: string
  contentLength?: number
}

export function FileUpload({ campaignId, onUploadComplete }: FileUploadProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploading(true)
    setResults([])

    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setResults(data.results)

      const successCount = data.results.filter((r: UploadResult) => r.success).length
      toast({
        title: 'Upload Complete',
        description: `Successfully imported ${successCount} of ${files.length} files as notes.`,
      })

      if (onUploadComplete) {
        onUploadComplete()
      }
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      })
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Upload Files
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Upload PDF, TXT, MD, or other text files to import as campaign notes.
            Files will be parsed and made searchable via AI.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
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
            accept=".pdf,.txt,.md,.markdown,.csv,.json,.docx"
            onChange={handleChange}
            className="hidden"
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Processing files...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Supports PDF, TXT, MD, CSV, JSON, DOCX
              </p>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
            <p className="text-sm font-medium">Results:</p>
            {results.map((result, index) => (
              <div
                key={index}
                className={`
                  flex items-center gap-2 text-sm p-2 rounded
                  ${result.success ? 'bg-green-500/10' : 'bg-red-500/10'}
                `}
              >
                {result.success ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="truncate">
                  {result.file}
                  {result.success && result.contentLength && (
                    <span className="text-muted-foreground ml-1">
                      ({Math.round(result.contentLength / 1000)}k chars)
                    </span>
                  )}
                  {result.error && (
                    <span className="text-red-500 ml-1">- {result.error}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
