'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'

interface BacklinkNote {
  id: string
  title: string
  slug: string
  note_type: string
}

interface BacklinksPanelProps {
  noteId: string
  campaignId: string
}

export function BacklinksPanel({ noteId, campaignId }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkNote[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadBacklinks = async () => {
      const { data } = await supabase
        .from('note_links')
        .select(`
          source_note:notes!source_note_id(
            id,
            title,
            slug,
            note_type
          )
        `)
        .eq('target_note_id', noteId)

      const notes = data
        ?.map((link) => link.source_note as unknown as BacklinkNote)
        .filter(Boolean) || []

      setBacklinks(notes)
      setLoading(false)
    }

    loadBacklinks()
  }, [noteId, supabase])

  if (loading) {
    return null
  }

  if (backlinks.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Backlinks ({backlinks.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {backlinks.map((note) => (
            <Link
              key={note.id}
              href={`/campaigns/${campaignId}/notes/${note.slug}`}
              className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors"
            >
              <Badge variant="outline" className={`note-type-${note.note_type}`}>
                {note.note_type.replace('_', ' ')}
              </Badge>
              <span className="font-medium">{note.title}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
