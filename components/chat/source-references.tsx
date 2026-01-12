'use client'

import Link from 'next/link'
import { SearchResult } from '@/lib/types'
import { ChatContent } from './chat-content'

interface SourceReferencesProps {
  sources: SearchResult[]
  campaignId: string
  showContent?: boolean
}

// Entity type to icon mapping
const typeIcons: Record<string, string> = {
  npc: '👤',
  location: '🏰',
  item: '💎',
  quest: '📜',
  session: '📖',
  creature: '🐉',
  faction: '⚔',
  lore: '📚',
  spell: '✨',
  deity: '☀',
  event: '⚡',
  player_character: '🛡',
  freeform: '📝',
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
    <div className="source-references">
      {uniqueSources.map((source, index) => {
        const entityId = source.entity_id || source.note_id
        const entityName = source.entity_name || source.note_title || 'Unknown'
        const entityType = source.entity_type || source.note_type || 'freeform'
        const icon = typeIcons[entityType] || '📝'

        return (
          <div key={`${entityId}-${index}`} className="source-card">
            <Link
              href={`/campaigns/${campaignId}/entities/${entityId}`}
              className="source-header"
            >
              <span className="source-icon">{icon}</span>
              <span className="source-name">{entityName}</span>
              <span className="source-type">{entityType}</span>
              {source.similarity && (
                <span className="source-similarity">
                  {Math.round(source.similarity * 100)}% match
                </span>
              )}
            </Link>
            {showContent && source.chunk_text && (
              <div className="source-excerpt">
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
  )
}
