import { memo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Note } from '@/lib/types'
import { Lock } from 'lucide-react'
import {
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
} from '@/lib/entity-colors'

interface NoteCardProps {
  note: Note
  campaignId: string
}

export const NoteCard = memo(function NoteCard({ note, campaignId }: NoteCardProps) {
  // Get first 150 chars of content for preview
  const preview = (note.content || '')
    .replace(/[#*_\[\]]/g, '')
    .slice(0, 150)
    .trim()

  const typeClasses = getEntityTypeBadgeClasses(note.noteType)

  return (
    <Link href={`/campaigns/${campaignId}/notes/${note.slug}`}>
      <Card className="hover:border-primary transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg line-clamp-1">{note.title}</CardTitle>
            {note.isDmOnly && (
              <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className={typeClasses}>
              {getEntityTypeLabel(note.noteType)}
            </Badge>
            {note.tags?.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {note.tags && note.tags.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{note.tags.length - 2}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {preview || 'No content'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Updated {new Date(note.updatedAt).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
})
