'use client'

import { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Pencil } from 'lucide-react'
import type { StagedEntity } from '@/lib/types'

const DEFAULT_ENTITY_TYPES = [
  { value: 'npc', label: 'NPC' },
  { value: 'player_character', label: 'Player Character' },
  { value: 'location', label: 'Location' },
  { value: 'item', label: 'Item' },
  { value: 'quest', label: 'Quest' },
  { value: 'faction', label: 'Faction' },
  { value: 'lore', label: 'Lore' },
  { value: 'creature', label: 'Creature' },
  { value: 'event', label: 'Event' },
  { value: 'spell', label: 'Spell' },
  { value: 'deity', label: 'Deity' },
  { value: 'freeform', label: 'Freeform' },
]

interface EntityEditModalProps {
  entity: StagedEntity | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (tempId: string, updates: Partial<StagedEntity>) => void
}

export function EntityEditModal({
  entity,
  open,
  onOpenChange,
  onSave,
}: EntityEditModalProps) {
  // Form state
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState('npc')
  const [content, setContent] = useState('')
  const [aliases, setAliases] = useState('')
  const [tags, setTags] = useState('')
  const [isDmOnly, setIsDmOnly] = useState(false)
  const [showCustomType, setShowCustomType] = useState(false)
  const [customType, setCustomType] = useState('')

  // Reset form when entity changes
  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setEntityType(entity.entityType)
      setContent(entity.content)
      setAliases(entity.aliases.join(', '))
      setTags(entity.tags.join(', '))
      setIsDmOnly(false) // Default to not DM-only
      setShowCustomType(false)
      setCustomType('')
    }
  }, [entity])

  // Check if entity type is in the default list
  const isKnownType = DEFAULT_ENTITY_TYPES.some((t) => t.value === entityType)

  const handleTypeChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomType(true)
      setCustomType('')
    } else {
      setShowCustomType(false)
      setEntityType(value)
    }
  }

  const handleCustomTypeConfirm = () => {
    if (customType.trim()) {
      const normalized = customType.trim().toLowerCase().replace(/\s+/g, '_')
      setEntityType(normalized)
      setShowCustomType(false)
    }
  }

  const handleSave = () => {
    if (!entity) return

    const canonicalName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    onSave(entity.tempId, {
      name: name.trim(),
      canonicalName,
      entityType,
      content: content.trim(),
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    })

    onOpenChange(false)
  }

  if (!entity) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Entity Before Approval
          </DialogTitle>
          <DialogDescription>
            Review and edit this extracted entity before committing it to the database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name and Type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Entity name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-type">Type</Label>
              {showCustomType ? (
                <div className="flex gap-2">
                  <Input
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    placeholder="Enter custom type..."
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCustomTypeConfirm}
                    disabled={!customType.trim()}
                  >
                    OK
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCustomType(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <select
                  value={isKnownType ? entityType : '__custom__'}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {DEFAULT_ENTITY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                  {!isKnownType && (
                    <option value={entityType}>
                      {entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  )}
                  <option value="__custom__">+ Add custom type...</option>
                </select>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="edit-content">Content</Label>
            <Textarea
              id="edit-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Entity description and details..."
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Supports Markdown. Use [[Entity Name]] to link to other wiki entries.
            </p>
          </div>

          {/* Aliases and Tags */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-aliases">Aliases (comma-separated)</Label>
              <Input
                id="edit-aliases"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder="Other names, nicknames..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
              <Input
                id="edit-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="wizard, mentor, ally..."
              />
            </div>
          </div>

          {/* DM Only */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="edit-isDmOnly"
              checked={isDmOnly}
              onCheckedChange={(checked) => setIsDmOnly(checked as boolean)}
            />
            <Label htmlFor="edit-isDmOnly" className="font-normal">
              DM Only (hidden from players)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
