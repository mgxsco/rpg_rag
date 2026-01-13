'use client'

import { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, FileJson, FileText, FolderArchive, Loader2 } from 'lucide-react'

interface ExportDialogProps {
  campaignId: string
  campaignName: string
}

export function ExportDialog({ campaignId, campaignName }: ExportDialogProps) {
  const [open, setOpen] = useState(false)
  const [exportType, setExportType] = useState<'backup' | 'compiled'>('backup')
  const [format, setFormat] = useState<'json' | 'markdown' | 'zip'>('json')
  const [includeDmOnly, setIncludeDmOnly] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)

    try {
      const params = new URLSearchParams()
      params.set('type', exportType)

      if (exportType === 'compiled') {
        params.set('format', format)
        params.set('includeDmOnly', String(includeDmOnly))
      }

      const response = await fetch(
        `/api/campaigns/${campaignId}/export?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error('Export failed')
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `${campaignName}-export`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setOpen(false)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Campaign</DialogTitle>
          <DialogDescription>
            Export &quot;{campaignName}&quot; for backup or sharing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Type */}
          <div className="space-y-3">
            <Label>Export Type</Label>
            <RadioGroup
              value={exportType}
              onValueChange={(v) => setExportType(v as 'backup' | 'compiled')}
            >
              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="backup" id="backup" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="backup" className="font-medium cursor-pointer">
                    <FileJson className="h-4 w-4 inline mr-2" />
                    Full Backup (JSON)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Complete backup for restoration. Includes all data, settings,
                    and documents.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="compiled" id="compiled" className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor="compiled" className="font-medium cursor-pointer">
                    <FileText className="h-4 w-4 inline mr-2" />
                    Compiled (Readable)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Human-readable format for sharing or printing. Organized by
                    entity type.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Format (only for compiled) */}
          {exportType === 'compiled' && (
            <div className="space-y-3">
              <Label>Format</Label>
              <RadioGroup
                value={format}
                onValueChange={(v) => setFormat(v as 'markdown' | 'zip')}
              >
                <div className="flex items-center space-x-3 p-2 border rounded-lg hover:bg-muted/50">
                  <RadioGroupItem value="markdown" id="markdown" />
                  <Label htmlFor="markdown" className="cursor-pointer">
                    <FileText className="h-4 w-4 inline mr-2" />
                    Single Markdown File
                  </Label>
                </div>

                <div className="flex items-center space-x-3 p-2 border rounded-lg hover:bg-muted/50">
                  <RadioGroupItem value="zip" id="zip" />
                  <Label htmlFor="zip" className="cursor-pointer">
                    <FolderArchive className="h-4 w-4 inline mr-2" />
                    ZIP with Folders
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* DM Only toggle (only for compiled) */}
          {exportType === 'compiled' && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="dm-only"
                checked={includeDmOnly}
                onCheckedChange={(checked) => setIncludeDmOnly(!!checked)}
              />
              <Label htmlFor="dm-only" className="cursor-pointer">
                Include DM-only content
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
