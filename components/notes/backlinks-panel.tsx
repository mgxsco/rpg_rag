'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'

interface BacklinkNote {
  id: string
  title: string
  slug: string
  noteType: string
}

interface BacklinksPanelProps {
  noteId: string
  campaignId: string
}

export function BacklinksPanel({ noteId, campaignId }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadBacklinks = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/notes/${noteId}/backlinks`)
        if (res.ok) {
          const data = await res.json()
          setBacklinks(data.backlinks || [])
        }
      } catch (error) {
        console.error('Failed to load backlinks:', error)
      }
      setLoading(false)
    }

    loadBacklinks()
  }, [noteId, campaignId])

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
              <Badge variant="outline" className={`note-type-${note.noteType}`}>
                {note.noteType.replace('_', ' ')}
              </Badge>
              <span className="font-medium">{note.title}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
