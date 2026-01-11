'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { NoteType } from '@/lib/types'
import { titleToSlug } from '@/lib/wikilinks/parser'
import { ArrowLeft } from 'lucide-react'

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

export default function NewNotePage({
  params,
}: {
  params: { campaignId: string }
}) {
  const searchParams = useSearchParams()
  const defaultType = (searchParams.get('type') as NoteType) || 'freeform'

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [noteType, setNoteType] = useState<NoteType>(defaultType)
  const [tags, setTags] = useState('')
  const [isDmOnly, setIsDmOnly] = useState(false)
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const tagArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    try {
      const res = await fetch(`/api/campaigns/${params.campaignId}/notes`, {
        method: 'POST',
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
          description: data.error || 'Failed to create note',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      toast({
        title: 'Success',
        description: 'Note created successfully!',
      })

      router.push(`/campaigns/${params.campaignId}/notes/${data.slug}`)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href={`/campaigns/${params.campaignId}/notes`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to notes
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create New Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter note title"
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
              <Textarea
                id="content"
                placeholder="Write your note content here...&#10;&#10;Use [[Note Title]] to link to other notes."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={15}
                className="font-mono"
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
                {loading ? 'Creating...' : 'Create Note'}
              </Button>
              <Link href={`/campaigns/${params.campaignId}/notes`}>
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
