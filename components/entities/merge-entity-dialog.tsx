'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, GitMerge } from 'lucide-react'
import { Entity } from '@/lib/db/schema'
import {
  getEntityTypeIcon,
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
} from '@/lib/entity-colors'

interface MergeEntityDialogProps {
  currentEntityId: string
  currentEntityName: string
  campaignId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MergeEntityDialog({
  currentEntityId,
  currentEntityName,
  campaignId,
  open,
  onOpenChange,
}: MergeEntityDialogProps) {
  const router = useRouter()
  const [entities, setEntities] = useState<Entity[]>([])
  const [filteredEntities, setFilteredEntities] = useState<Entity[]>([])
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isMerging, setIsMerging] = useState(false)

  // Fetch entities when dialog opens
  useEffect(() => {
    if (open) {
      fetchEntities()
    } else {
      // Reset state when dialog closes
      setSelectedEntity(null)
      setSearch('')
    }
  }, [open])

  // Filter entities based on search
  useEffect(() => {
    if (!search.trim()) {
      setFilteredEntities(entities)
    } else {
      const searchLower = search.toLowerCase()
      setFilteredEntities(
        entities.filter(
          (e) =>
            e.name.toLowerCase().includes(searchLower) ||
            e.aliases?.some((a) => a.toLowerCase().includes(searchLower))
        )
      )
    }
  }, [search, entities])

  async function fetchEntities() {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/entities`)
      if (response.ok) {
        const data = await response.json()
        // Filter out the current entity
        const otherEntities = data.entities.filter(
          (e: Entity) => e.id !== currentEntityId
        )
        setEntities(otherEntities)
        setFilteredEntities(otherEntities)
      }
    } catch (error) {
      console.error('Error fetching entities:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleMerge() {
    if (!selectedEntity) return

    setIsMerging(true)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/entities/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryEntityId: currentEntityId,
          secondaryEntityId: selectedEntity.id,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to merge entities')
      }

      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error('Error merging entities:', error)
      alert(error instanceof Error ? error.message : 'Failed to merge entities')
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge into "{currentEntityName}"
          </DialogTitle>
          <DialogDescription>
            Select an entity to merge into this one. The selected entity's content
            will be appended, aliases merged, and relationships transferred. The
            selected entity will then be deleted.
          </DialogDescription>
        </DialogHeader>

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
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEntities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {search ? 'No matching entities found' : 'No other entities available'}
              </div>
            ) : (
              <div className="divide-y">
                {filteredEntities.map((entity) => {
                  const Icon = getEntityTypeIcon(entity.entityType)
                  const typeClasses = getEntityTypeBadgeClasses(entity.entityType)
                  const isSelected = selectedEntity?.id === entity.id

                  return (
                    <button
                      key={entity.id}
                      type="button"
                      onClick={() => setSelectedEntity(entity)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors ${
                        isSelected ? 'bg-accent' : ''
                      }`}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate font-medium">
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

          {/* Selected entity preview */}
          {selectedEntity && (
            <div className="bg-muted/50 rounded-md p-3 text-sm">
              <p className="font-medium mb-1">Merge preview:</p>
              <p className="text-muted-foreground">
                <strong>{selectedEntity.name}</strong> will be merged into{' '}
                <strong>{currentEntityName}</strong>. Content will be concatenated,
                aliases combined, and all relationships transferred.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={!selectedEntity || isMerging}>
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="mr-2 h-4 w-4" />
                Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
