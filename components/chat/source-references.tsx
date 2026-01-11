'use client'

import Link from 'next/link'
import { SearchResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { FileText } from 'lucide-react'

interface SourceReferencesProps {
  sources: SearchResult[]
  campaignId: string
}

export function SourceReferences({ sources, campaignId }: SourceReferencesProps) {
  // Deduplicate sources by note_id
  const uniqueSources = sources.reduce((acc, source) => {
    if (!acc.find((s) => s.note_id === source.note_id)) {
      acc.push(source)
    }
    return acc
  }, [] as SearchResult[])

  if (uniqueSources.length === 0) {
    return null
  }

  return (
    <div className="mt-2">
      <p className="text-xs text-muted-foreground mb-1">Sources:</p>
      <div className="flex flex-wrap gap-1">
        {uniqueSources.map((source, index) => (
          <Link
            key={`${source.note_id}-${index}`}
            href={`/campaigns/${campaignId}/notes/${source.note_slug}`}
            className="inline-flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 px-2 py-1 rounded transition-colors"
          >
            <FileText className="h-3 w-3" />
            <span className="max-w-[150px] truncate">{source.note_title}</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1 py-0 note-type-${source.note_type}`}
            >
              {source.note_type}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  )
}
