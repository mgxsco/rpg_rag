'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, FileJson, CheckCircle, AlertCircle } from 'lucide-react'

interface ImportPreview {
  valid: boolean
  campaign: {
    name: string
    description: string | null
    language: string
  }
  stats: {
    members: number
    entities: number
    relationships: number
    documents: number
  }
  exportedAt: string
  exportedBy: string
}

interface ImportResult {
  success: boolean
  campaignId: string
  campaignName: string
  stats: {
    members: number
    entities: number
    relationships: number
    documents: number
    entitySources: number
    entityVersions: number
  }
  warnings: string[]
}

export function ImportDialog() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setPreview(null)
    setResult(null)
    setError(null)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/campaigns/import', {
        method: 'PUT',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Invalid backup file')
        return
      }

      setPreview(data)
    } catch (err) {
      setError('Failed to read backup file')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/campaigns/import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Import failed')
        return
      }

      setResult(data)
    } catch (err) {
      setError('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)

    // Navigate to the new campaign if import was successful
    if (result?.campaignId) {
      router.push(`/campaigns/${result.campaignId}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Import Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Campaign</DialogTitle>
          <DialogDescription>
            Restore a campaign from a backup file (.json).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Input */}
          {!result && (
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileJson className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click to select a backup file
                </p>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Processing...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Preview */}
          {preview && !result && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium">{preview.campaign.name}</h4>
              {preview.campaign.description && (
                <p className="text-sm text-muted-foreground">
                  {preview.campaign.description}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Entities:</span>{' '}
                  <span className="font-medium">{preview.stats.entities}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Relationships:</span>{' '}
                  <span className="font-medium">{preview.stats.relationships}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Documents:</span>{' '}
                  <span className="font-medium">{preview.stats.documents}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Members:</span>{' '}
                  <span className="font-medium">{preview.stats.members}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Exported on {new Date(preview.exportedAt).toLocaleDateString()} by{' '}
                {preview.exportedBy}
              </p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Import Successful!</span>
              </div>
              <p className="text-sm">
                Campaign &quot;{result.campaignName}&quot; has been created with:
              </p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>{result.stats.entities} entities</li>
                <li>{result.stats.relationships} relationships</li>
                <li>{result.stats.documents} documents</li>
                <li>{result.stats.members} members</li>
              </ul>
              {result.warnings.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium text-yellow-600">Warnings:</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {result.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {result.warnings.length > 5 && (
                      <li>...and {result.warnings.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={handleClose}>Go to Campaign</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!preview || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
