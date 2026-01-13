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
    <div className="baron-stone">
      {/* Stone Header */}
      <div className="stone-header">
        <div className="stone-crack left">⚡</div>
        <h2 className="stone-title">
          <span className="stone-icon">🪨</span>
          Barão Pedregulho Língua-Solta
        </h2>
        <div className="stone-crack right">⚡</div>
      </div>

      {/* Grumpy Subtitle */}
      <div className="baron-subtitle">
        <span className="subtitle-text">~ Sábio Injustamente Aprisionado ~</span>
        <span className="subtitle-small">(NÃO sou fofoqueiro, sou um consultor de informações!)</span>
      </div>

      {/* Mode Selection */}
      <div className="baron-modes">
        <button
          type="button"
          onClick={() => setMode('rag')}
          className={`baron-mode-btn ${mode === 'rag' ? 'active' : ''}`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Consultar o Barão</span>
          <div className="mode-glow" />
        </button>
        <div className="mode-divider">💢</div>
        <button
          type="button"
          onClick={() => setMode('direct')}
          className={`baron-mode-btn ${mode === 'direct' ? 'active' : ''}`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Vasculhar Registros</span>
          <div className="mode-glow" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="stone-content">
        <div className="stone-texture left" />
        <ScrollArea className="stone-scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="baron-empty">
              <div className="baron-face">🗿</div>
              <h3>Hmph! O que você quer?!</h3>
              <p className="baron-subtitle-text">
                {mode === 'rag'
                  ? 'Tsc... lá vem mais um querendo informação. PERGUNTE logo e me deixe em paz!'
                  : 'Quer vasculhar os registros? Faça você mesmo! Ah, espera... eu que tenho que ajudar. QUE VIDA MISERÁVEL!'
                }
              </p>
              <div className="baron-suggestions">
                <p className="suggestions-title">Perguntas que NÃO me interessam (mas vou responder mesmo assim):</p>
                <ul>
                  <li><span className="suggestion-icon">⚔️</span> &ldquo;Quem são os inimigos da campanha?&rdquo;</li>
                  <li><span className="suggestion-icon">🏰</span> &ldquo;Fale sobre os lugares importantes&rdquo;</li>
                  <li><span className="suggestion-icon">📜</span> &ldquo;O que aconteceu na última sessão?&rdquo;</li>
                  <li><span className="suggestion-icon">👥</span> &ldquo;Quem é fulano?&rdquo; (não que eu me importe!)</li>
                </ul>
              </div>
              <div className="baron-complaint">
                <span>Séculos preso numa pedra fria... sem braços, sem pernas, sem um MÍSERO chá quente...</span>
              </div>
            </div>
          ) : (
            <div className="stone-messages">
              {messages.map((message, index) => (
                <ChatMessageComponent
                  key={index}
                  message={message}
                  campaignId={campaignId}
                />
              ))}
              {sending && (
                <div className="baron-thinking">
                  <div className="thinking-stone">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <span>Hmph... deixa eu ver... não que eu QUEIRA ajudar...</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        <div className="stone-texture right" />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="baron-input-area">
        <div className="input-ornament top">── 💢 ──</div>

        <div className="baron-input-container">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'rag'
              ? "Fala logo o que você quer saber... TSC!"
              : "Digite o que procura nos registros... (e seja rápido!)"
            }
            className="baron-textarea"
            disabled={sending}
          />
          <Button
            type="submit"
            disabled={!input.trim() || sending}
            className="baron-send-btn"
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
              ? '🗿 O Barão consulta (resmungando) seus conhecimentos'
              : '📚 Busca direta nos registros da campanha'
            }
          </span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="clear-history-btn"
            >
              <Trash2 className="w-3 h-3" />
              <span>Limpar Conversa</span>
            </button>
          )}
        </div>
      </form>

      {/* Footer */}
      <div className="stone-footer">
        <div className="stone-corner bl">◆</div>
        <div className="stone-footer-text">~ Aprisionado por &ldquo;motivos políticos&rdquo; (saber demais NÃO é crime!) ~</div>
        <div className="stone-corner br">◆</div>
      </div>
    </div>
  )
}
