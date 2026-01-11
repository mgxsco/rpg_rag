'use client'

import { ChatMessage } from '@/lib/types'
import { SourceReferences } from './source-references'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, User } from 'lucide-react'

interface ChatMessageComponentProps {
  message: ChatMessage
  campaignId: string
}

export function ChatMessageComponent({
  message,
  campaignId,
}: ChatMessageComponentProps) {
  const isAssistant = message.role === 'assistant'

  return (
    <div className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      <Avatar className={`h-8 w-8 ${isAssistant ? 'bg-primary' : 'bg-secondary'}`}>
        <AvatarFallback>
          {isAssistant ? (
            <Bot className="h-4 w-4 text-primary-foreground" />
          ) : (
            <User className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>

      <div className={`flex-1 space-y-2 ${isAssistant ? '' : 'text-right'}`}>
        <div
          className={`inline-block rounded-lg px-4 py-2 max-w-[85%] ${
            isAssistant
              ? 'bg-muted text-left'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        </div>

        {isAssistant && message.sources && message.sources.length > 0 && (
          <SourceReferences sources={message.sources} campaignId={campaignId} />
        )}
      </div>
    </div>
  )
}
