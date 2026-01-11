'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessageComponent } from './chat-message'
import { ChatMessage } from '@/lib/types'
import { Send, Trash2, Loader2 } from 'lucide-react'

interface ChatInterfaceProps {
  messages: ChatMessage[]
  onSendMessage: (content: string) => Promise<void>
  onClearHistory: () => void
  campaignId: string
}

export function ChatInterface({
  messages,
  onSendMessage,
  onClearHistory,
  campaignId,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return

    const message = input.trim()
    setInput('')
    setSending(true)

    try {
      await onSendMessage(message)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardContent className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Chat History</h3>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearHistory}
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-muted-foreground">
              <div>
                <p className="text-lg font-medium mb-2">Ask me anything about your campaign!</p>
                <p className="text-sm">
                  Try questions like:
                </p>
                <ul className="text-sm mt-2 space-y-1">
                  <li>&quot;Who is the main villain?&quot;</li>
                  <li>&quot;What happened in the last session?&quot;</li>
                  <li>&quot;Tell me about the city of Neverwinter&quot;</li>
                  <li>&quot;What quests are currently active?&quot;</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <ChatMessageComponent
                  key={index}
                  message={message}
                  campaignId={campaignId}
                />
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <form onSubmit={handleSubmit} className="mt-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your campaign..."
              className="min-h-[60px] resize-none"
              disabled={sending}
            />
            <Button type="submit" disabled={!input.trim() || sending} className="px-6">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
