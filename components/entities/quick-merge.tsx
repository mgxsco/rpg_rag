'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, GitMerge, Search, ArrowRight, AlertTriangle } from 'lucide-react'
import { getEntityTypeIcon, getEntityTypeBadgeClasses, getEntityTypeLabel } from '@/lib/entity-colors'

interface Entity {
  id: string
  name: string
  entityType: string
  aliases: string[] | null
  content?: string
}

interface QuickMergeProps {
  campaignId: string
  sourceEntity: Entity
}

export function QuickMerge({ campaignId, sourceEntity }: QuickMergeProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<Entity | null>(null)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load entities when dialog opens
  useEffect(() => {
    if (open && entities.length === 0) {
      loadEntities()
    }
  }, [open])

  const loadEntities = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/entities`)
      if (response.ok) {
        const data = await response.json()
        // Filter out the source entity
        setEntities((data.entities || []).filter((e: Entity) => e.id !== sourceEntity.id))
      }
    } catch (err) {
      console.error('Failed to load entities:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredEntities = search
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.aliases?.some((a) => a.toLowerCase().includes(search.toLowerCase()))
      )
    : entities

  const handleMerge = async () => {
    if (!selectedTarget) return

    setMerging(true)
    setError(null)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/entities/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryEntityId: selectedTarget.id, // Keep the target
          secondaryEntityId: sourceEntity.id, // Delete the source
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Merge failed')
      }

      // Close dialogs and redirect to merged entity
      setConfirmOpen(false)
      setOpen(false)
      router.push(`/campaigns/${campaignId}/entities/${selectedTarget.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge entities')
      setConfirmOpen(false)
    } finally {
      setMerging(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <GitMerge className="h-4 w-4 mr-2" />
            Merge Into...
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge "{sourceEntity.name}" Into Another Entity
            </DialogTitle>
            <DialogDescription>
              Select an entity to merge this one into. The selected entity will keep its ID and
              receive the content, aliases, and relationships from "{sourceEntity.name}".
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entities..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Entity list */}
            <div className="max-h-64 overflow-y-auto border rounded-md">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredEntities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {search ? 'No matching entities' : 'No other entities'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredEntities.map((entity) => {
                    const Icon = getEntityTypeIcon(entity.entityType)
                    const typeClasses = getEntityTypeBadgeClasses(entity.entityType)
                    const isSelected = selectedTarget?.id === entity.id

                    return (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => setSelectedTarget(entity)}
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

            {/* Preview */}
            {selectedTarget && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Merge Preview:</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{sourceEntity.name}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedTarget.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  "{sourceEntity.name}" will be deleted. Its content, aliases, and relationships
                  will be added to "{selectedTarget.name}".
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!selectedTarget || merging}
            >
              {merging ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4 mr-2" />
              )}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Merge
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to merge "{sourceEntity.name}" into "{selectedTarget?.name}"?
              <br /><br />
              This action <strong>cannot be undone</strong>. "{sourceEntity.name}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={merging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {merging ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4 mr-2" />
              )}
              Yes, Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
