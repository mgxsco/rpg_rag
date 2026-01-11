'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { NoteEditor } from '@/components/editor/note-editor'
import { Note, NoteType } from '@/lib/types'
import { ArrowLeft, Save } from 'lucide-react'

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'session', label: 'Session' },
  { value: 'npc', label: 'NPC' },
  { value: 'location', label: 'Location' },
  { value: 'item', label: 'Item' },
  { value: 'lore', label: 'Lore' },
  { value: 'quest', label: 'Quest' },
  { value: 'faction', label: 'Faction' },
  { value: 'player_character', label: 'Player Character' },
  { value: 'freeform', label: 'Freeform' },
]

export default function EditNotePage({
  params,
}: {
  params: { campaignId: string; slug: string }
}) {
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('freeform')
  const [tags, setTags] = useState('')
  const [isDmOnly, setIsDmOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [allNotes, setAllNotes] = useState<{ title: string; slug: string }[]>([])

  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    const loadNote = async () => {
      const { data } = await supabase
        .from('notes')
        .select('*')
        .eq('campaign_id', params.campaignId)
        .eq('slug', params.slug)
        .single()

      if (data) {
        setNote(data)
        setTitle(data.title)
        setContent(data.content)
        setNoteType(data.note_type)
        setTags(data.tags?.join(', ') || '')
        setIsDmOnly(data.is_dm_only)
      }
    }

    const loadAllNotes = async () => {
      const { data } = await supabase
        .from('notes')
        .select('title, slug')
        .eq('campaign_id', params.campaignId)

      if (data) {
        setAllNotes(data)
      }
    }

    loadNote()
    loadAllNotes()
  }, [params.campaignId, params.slug, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    // Save version first
    await supabase.from('note_versions').insert({
      note_id: note.id,
      title: note.title,
      content: note.content,
      edited_by: user.id,
    })

    const tagArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const { error } = await supabase
      .from('notes')
      .update({
        title,
        content,
        note_type: noteType,
        tags: tagArray,
        is_dm_only: isDmOnly,
      })
      .eq('id', note.id)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    // Sync wikilinks and embeddings via API
    await fetch(`/api/notes/${note.id}/sync`, {
      method: 'POST',
    })

    toast({
      title: 'Success',
      description: 'Note updated successfully!',
    })

    router.push(`/campaigns/${params.campaignId}/notes/${params.slug}`)
    router.refresh()
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href={`/campaigns/${params.campaignId}/notes/${params.slug}`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to note
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <p className="text-sm text-muted-foreground">
                Use Markdown for formatting. Link to other notes with [[Note Title]].
              </p>
              <NoteEditor
                content={content}
                onChange={setContent}
                campaignId={params.campaignId}
                existingNotes={allNotes}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="combat, roleplay, mystery"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Visibility</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="dmOnly"
                    checked={isDmOnly}
                    onChange={(e) => setIsDmOnly(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="dmOnly" className="font-normal cursor-pointer">
                    DM Only (hidden from players)
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
              <Link href={`/campaigns/${params.campaignId}/notes/${params.slug}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
