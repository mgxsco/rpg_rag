'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessageComponent } from './chat-message'
import { ChatMessage } from '@/lib/types'
import { Send, Trash2, Loader2, Sparkles, BookOpen } from 'lucide-react'

export type ChatMode = 'rag' | 'direct'

interface ChatInterfaceProps {
  messages: ChatMessage[]
  onSendMessage: (content: string, mode: ChatMode) => Promise<void>
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
  const [mode, setMode] = useState<ChatMode>('rag')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
      await onSendMessage(message, mode)
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
    <div className="oracle-tome">
      {/* Tome Header */}
      <div className="tome-header">
        <div className="tome-header-ornament left">❧</div>
        <h2 className="tome-title">
          <span className="tome-icon">🔮</span>
          The Oracle&apos;s Sanctum
        </h2>
        <div className="tome-header-ornament right">❧</div>
      </div>

      {/* Mode Selection - Magical Runes */}
      <div className="oracle-modes">
        <button
          type="button"
          onClick={() => setMode('rag')}
          className={`oracle-mode-btn ${mode === 'rag' ? 'active' : ''}`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Consult Oracle</span>
          <div className="mode-glow" />
        </button>
        <div className="mode-divider">⚔</div>
        <button
          type="button"
          onClick={() => setMode('direct')}
          className={`oracle-mode-btn ${mode === 'direct' ? 'active' : ''}`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Search Tomes</span>
          <div className="mode-glow" />
        </button>
      </div>

      {/* Scroll/Messages Area */}
      <div className="tome-content">
        <div className="tome-page-edge left" />
        <ScrollArea className="tome-scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="oracle-empty">
              <div className="oracle-crystal">🔮</div>
              <h3>The Oracle Awaits...</h3>
              <p className="oracle-subtitle">
                {mode === 'rag'
                  ? 'Ask and the spirits shall divine answers from your chronicles'
                  : 'Search the ancient tomes for forgotten knowledge'
                }
              </p>
              <div className="oracle-suggestions">
                <p className="suggestions-title">Whisper your query...</p>
                <ul>
                  <li><span className="suggestion-icon">⚔</span> &ldquo;Who threatens the realm?&rdquo;</li>
                  <li><span className="suggestion-icon">🏰</span> &ldquo;Tell me of ancient places&rdquo;</li>
                  <li><span className="suggestion-icon">📜</span> &ldquo;What befell us last session?&rdquo;</li>
                  <li><span className="suggestion-icon">💎</span> &ldquo;What treasures have we found?&rdquo;</li>
                </ul>
              </div>
              <div className="oracle-runes">᛭ ᚨ ᛊ ᚲ ᛭</div>
            </div>
          ) : (
            <div className="tome-messages">
              {messages.map((message, index) => (
                <ChatMessageComponent
                  key={index}
                  message={message}
                  campaignId={campaignId}
                />
              ))}
              {sending && (
                <div className="oracle-thinking">
                  <div className="thinking-orb">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <span>The Oracle peers into the mists...</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        <div className="tome-page-edge right" />
      </div>

      {/* Input Area - Inscription */}
      <form onSubmit={handleSubmit} className="oracle-input-area">
        <div className="input-ornament top">── ✦ ──</div>

        <div className="oracle-input-container">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'rag'
              ? "Speak your question unto the Oracle..."
              : "What knowledge do you seek in the tomes..."
            }
            className="oracle-textarea"
            disabled={sending}
          />
          <Button
            type="submit"
            disabled={!input.trim() || sending}
            className="oracle-send-btn"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>

        <div className="input-footer">
          <span className="input-hint">
            {mode === 'rag'
              ? '✨ The Oracle consults your chronicles'
              : '📚 Direct search through ancient records'
            }
          </span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="clear-history-btn"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Visions</span>
            </button>
          )}
        </div>
      </form>

      {/* Tome Footer Decoration */}
      <div className="tome-footer">
        <div className="tome-corner-decoration bl">◈</div>
        <div className="tome-footer-text">~ Bound by Ancient Magic ~</div>
        <div className="tome-corner-decoration br">◈</div>
      </div>
    </div>
  )
}
