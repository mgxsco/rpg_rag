'use client'

import Link from 'next/link'
import { SearchResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { FileText } from 'lucide-react'
import { ChatContent } from './chat-content'

interface SourceReferencesProps {
  sources: SearchResult[]
  campaignId: string
  showContent?: boolean
}

export function SourceReferences({ sources, campaignId, showContent = false }: SourceReferencesProps) {
  // Deduplicate sources by entity_id
  const uniqueSources = sources.reduce((acc, source) => {
    const id = source.entity_id || source.note_id
    if (!acc.find((s) => (s.entity_id || s.note_id) === id)) {
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
      <div className={showContent ? 'space-y-2' : 'flex flex-wrap gap-1'}>
        {uniqueSources.map((source, index) => {
          const entityId = source.entity_id || source.note_id
          const entityName = source.entity_name || source.note_title || 'Unknown'
          const entityType = source.entity_type || source.note_type || 'unknown'

          return (
            <div key={`${entityId}-${index}`} className={showContent ? 'border rounded-md p-2' : ''}>
              <Link
                href={`/campaigns/${campaignId}/entities/${entityId}`}
                className="inline-flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 px-2 py-1 rounded transition-colors"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-[150px] truncate">{entityName}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1 py-0 note-type-${entityType}`}
                >
                  {entityType}
                </Badge>
                {source.similarity && (
                  <span className="text-muted-foreground ml-1">
                    {Math.round(source.similarity * 100)}%
                  </span>
                )}
              </Link>
              {showContent && source.chunk_text && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-3">
                  <ChatContent
                    content={source.chunk_text}
                    campaignId={campaignId}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
