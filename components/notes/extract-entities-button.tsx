'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Sparkles, Loader2, CheckCircle } from 'lucide-react'

interface ExtractEntitiesButtonProps {
  campaignId: string
  noteSlug: string
  noteTitle: string
}

interface ExtractionResult {
  success: boolean
  message: string
  entitiesCreated: number
  entities: Array<{ id: string; name: string; type: string }>
  relationshipsCreated: number
}

export function ExtractEntitiesButton({
  campaignId,
  noteSlug,
  noteTitle,
}: ExtractEntitiesButtonProps) {
  const [open, setOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const { toast } = useToast()

  const handleExtract = async () => {
    setExtracting(true)
    setResult(null)

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/notes/${noteSlug}/extract`,
        {
          method: 'POST',
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Extraction failed')
      }

      setResult(data)
      toast({
        title: 'Extraction Complete',
        description: data.message,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Extraction failed',
        variant: 'destructive',
      })
    } finally {
      setExtracting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-4 w-4 mr-1" />
          Extract Entities
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extract Entities from Note</DialogTitle>
          <DialogDescription>
            AI will analyze &quot;{noteTitle}&quot; and extract entities (NPCs, locations, items, etc.)
            to add to your campaign wiki.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-4">
            <div className="flex items-center gap-2 text-green-600 mb-4">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Extraction Complete!</span>
            </div>

            <div className="space-y-2 text-sm">
              <p>
                <strong>{result.entitiesCreated}</strong> entities created
              </p>
              <p>
                <strong>{result.relationshipsCreated}</strong> relationships created
              </p>

              {result.entities.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium mb-1">Entities:</p>
                  <ul className="list-disc list-inside text-muted-foreground max-h-40 overflow-y-auto">
                    {result.entities.map((entity) => (
                      <li key={entity.id}>
                        {entity.name} ({entity.type})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">
            <p>This will:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Analyze the note content using AI</li>
              <li>Extract named entities (NPCs, locations, items, etc.)</li>
              <li>Detect relationships between entities</li>
              <li>Add extracted entities to your campaign wiki</li>
            </ul>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={extracting}>
                Cancel
              </Button>
              <Button onClick={handleExtract} disabled={extracting}>
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Extract
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
