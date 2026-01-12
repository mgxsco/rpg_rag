'use client'

import { ChatMessage } from '@/lib/types'
import { SourceReferences } from './source-references'
import { ChatContent } from './chat-content'
import { Scroll, Feather, Eye } from 'lucide-react'

interface ChatMessageComponentProps {
  message: ChatMessage
  campaignId: string
}

export function ChatMessageComponent({
  message,
  campaignId,
}: ChatMessageComponentProps) {
  const isAssistant = message.role === 'assistant'
  const isSearchResult = message.content?.startsWith('Found ') || message.content?.startsWith('No matching')

  if (!isAssistant) {
    // User message - styled as adventurer's query
    return (
      <div className="adventurer-message">
        <div className="adventurer-icon">
          <Feather className="w-4 h-4" />
        </div>
        <div className="adventurer-content">
          <div className="adventurer-label">Your Query</div>
          <p>{message.content}</p>
        </div>
      </div>
    )
  }

  // Oracle/Search response
  return (
    <div className={`oracle-message ${isSearchResult ? 'search-result' : ''}`}>
      <div className="oracle-message-header">
        <div className="oracle-icon">
          {isSearchResult ? (
            <Scroll className="w-5 h-5" />
          ) : (
            <Eye className="w-5 h-5" />
          )}
        </div>
        <span className="oracle-label">
          {isSearchResult ? 'From the Archives' : 'The Oracle Speaks'}
        </span>
        <div className="oracle-header-decoration">✧</div>
      </div>

      <div className="oracle-message-body">
        <div className="oracle-quote-mark">"</div>
        <ChatContent
          content={message.content}
          campaignId={campaignId}
          className="oracle-text"
        />
        <div className="oracle-quote-mark end">"</div>
      </div>

      {message.sources && message.sources.length > 0 && (
        <div className="oracle-sources">
          <div className="sources-header">
            <span className="sources-icon">📜</span>
            <span>Ancient References</span>
          </div>
          <SourceReferences
            sources={message.sources}
            campaignId={campaignId}
            showContent={isSearchResult}
          />
        </div>
      )}

      <div className="oracle-message-footer">
        <span className="oracle-seal">◆</span>
      </div>
    </div>
  )
}
