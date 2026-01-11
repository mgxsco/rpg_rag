'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
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
  const { data: session } = useSession()

  useEffect(() => {
    const loadNote = async () => {
      try {
        const res = await fetch(`/api/campaigns/${params.campaignId}/notes/${params.slug}`)
        if (res.ok) {
          const data = await res.json()
          setNote(data)
          setTitle(data.title)
          setContent(data.content)
          setNoteType(data.noteType)
          setTags(data.tags?.join(', ') || '')
          setIsDmOnly(data.isDmOnly)
        }
      } catch (error) {
        console.error('Failed to load note:', error)
      }
    }

    const loadAllNotes = async () => {
      try {
        const res = await fetch(`/api/campaigns/${params.campaignId}/notes`)
        if (res.ok) {
          const data = await res.json()
          const notesList = data.notes || data
          setAllNotes(notesList.map((n: any) => ({ title: n.title, slug: n.slug })))
        }
      } catch (error) {
        console.error('Failed to load notes:', error)
      }
    }

    if (session?.user) {
      loadNote()
      loadAllNotes()
    }
  }, [params.campaignId, params.slug, session])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note) return
    setLoading(true)

    if (!session?.user) {
      toast({
        title: 'Error',
        description: 'You must be logged in',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    const tagArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    try {
      const res = await fetch(`/api/campaigns/${params.campaignId}/notes/${params.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          noteType,
          tags: tagArray,
          isDmOnly,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update note',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      toast({
        title: 'Success',
        description: 'Note updated successfully!',
      })

      router.push(`/campaigns/${params.campaignId}/notes/${params.slug}`)
      router.refresh()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      })
      setLoading(false)
    }
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
