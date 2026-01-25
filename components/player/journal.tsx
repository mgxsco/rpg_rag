'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import { Plus, Edit, Trash2, BookOpen, Calendar, Loader2 } from 'lucide-react'
import { Entity } from '@/lib/db/schema'

// Simple relative time formatter
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  return date.toLocaleDateString()
}

interface JournalProps {
  campaignId: string
  memberId: string
  entries: Entity[]
  entityMap: Map<string, string>
}

export function Journal({ campaignId, memberId, entries: initialEntries, entityMap }: JournalProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<Entity[]>(initialEntries)
  const [isCreating, setIsCreating] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Entity | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<Entity | null>(null)

  const handleCreate = async () => {
    if (!title.trim()) return

    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: title,
          entityType: 'journal_entry',
          content: content,
          isDmOnly: false,
          playerId: memberId,
        }),
      })

      if (res.ok) {
        const newEntry = await res.json()
        setEntries([newEntry, ...entries])
        setTitle('')
        setContent('')
        setIsCreating(false)
      }
    } catch (error) {
      console.error('Failed to create journal entry:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingEntry || !title.trim()) return

    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities/${editingEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: title,
          content: content,
        }),
      })

      if (res.ok) {
        const updated = await res.json()
        setEntries(entries.map((e) => (e.id === updated.id ? updated : e)))
        setEditingEntry(null)
        setTitle('')
        setContent('')
        if (selectedEntry?.id === updated.id) {
          setSelectedEntry(updated)
        }
      }
    } catch (error) {
      console.error('Failed to update journal entry:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (entry: Entity) => {
    if (!confirm('Are you sure you want to delete this journal entry?')) return

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities/${entry.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setEntries(entries.filter((e) => e.id !== entry.id))
        if (selectedEntry?.id === entry.id) {
          setSelectedEntry(null)
        }
      }
    } catch (error) {
      console.error('Failed to delete journal entry:', error)
    }
  }

  const openEdit = (entry: Entity) => {
    setEditingEntry(entry)
    setTitle(entry.name)
    setContent(entry.content || '')
  }

  const closeDialog = () => {
    setIsCreating(false)
    setEditingEntry(null)
    setTitle('')
    setContent('')
  }

  return (
    <div className="space-y-6">
      {/* Header with Create button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <Dialog open={isCreating || !!editingEntry} onOpenChange={(open) => !open && closeDialog()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? 'Edit Journal Entry' : 'New Journal Entry'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Session 5 Notes, Character Thoughts..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Content</label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your journal entry here... Use [[Entity Name]] to link to wiki entries."
                  rows={12}
                  className="font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                onClick={editingEntry ? handleUpdate : handleCreate}
                disabled={saving || !title.trim()}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingEntry ? 'Save Changes' : 'Create Entry'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Journal Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <Card
            key={entry.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setSelectedEntry(entry)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{entry.name}</CardTitle>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(entry)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(entry)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {entry.content?.slice(0, 150) || 'No content'}
                {(entry.content?.length || 0) > 150 && '...'}
              </p>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatRelativeTime(new Date(entry.updatedAt))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No journal entries yet</h3>
          <p className="mb-4">Start writing your personal campaign journal</p>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Write First Entry
          </Button>
        </div>
      )}

      {/* Entry Detail Modal */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedEntry && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-2xl">{selectedEntry.name}</DialogTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedEntry(null)
                        openEdit(selectedEntry)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Last updated {formatRelativeTime(new Date(selectedEntry.updatedAt))}
                </p>
              </DialogHeader>
              <div className="py-4">
                <MarkdownRenderer
                  content={selectedEntry.content || ''}
                  campaignId={campaignId}
                  noteMap={entityMap}
                  isEntityMode={true}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
