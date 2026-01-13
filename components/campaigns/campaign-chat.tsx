'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageSquare, Send, Loader2, User, Theater, Quote } from 'lucide-react'
import { getSupabaseClient, getCampaignChannelName } from '@/lib/supabase'

interface ChatMessage {
  id: string
  content: string
  messageType: 'ooc' | 'ic' | 'system'
  characterName: string | null
  createdAt: string
  user: {
    id: string
    name: string | null
    image: string | null
  }
}

interface CampaignChatProps {
  campaignId: string
  currentUserId?: string
}

export function CampaignChat({ campaignId, currentUserId }: CampaignChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  // Message input state
  const [messageContent, setMessageContent] = useState('')
  const [messageType, setMessageType] = useState<'ooc' | 'ic'>('ooc')
  const [characterName, setCharacterName] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  // Fetch message history
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/messages?limit=100`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages)
          setError(null)
        } else {
          setError('Failed to load messages')
        }
      } catch (err) {
        setError('Failed to load messages')
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()
  }, [campaignId])

  // Scroll to bottom when messages load
  useEffect(() => {
    if (!loading) {
      setTimeout(scrollToBottom, 100)
    }
  }, [loading, scrollToBottom])

  // Subscribe to Supabase Realtime for new messages
  useEffect(() => {
    let channel: ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null = null

    const supabase = getSupabaseClient()
    if (!supabase) {
      // Supabase not configured - realtime disabled, messages will still work via polling
      console.warn('Supabase realtime not available - using fetch only')
      return
    }

    try {
      channel = supabase.channel(getCampaignChannelName(campaignId))

      channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `campaign_id=eq.${campaignId}`,
          },
          async (payload) => {
            // The payload contains the raw database row
            // We need to fetch user info separately since it's not included
            const newRow = payload.new as {
              id: string
              content: string
              message_type: string
              character_name: string | null
              created_at: string
              user_id: string
            }

            // Fetch user info for the new message
            const res = await fetch(`/api/campaigns/${campaignId}/messages?limit=1`)
            if (res.ok) {
              const data = await res.json()
              const latestMessage = data.messages.find((m: ChatMessage) => m.id === newRow.id)

              if (latestMessage) {
                setMessages((prev) => {
                  // Avoid duplicates
                  if (prev.some((m) => m.id === latestMessage.id)) {
                    return prev
                  }
                  return [...prev, latestMessage]
                })
                setTimeout(scrollToBottom, 100)
              }
            }
          }
        )
        .subscribe((status) => {
          setRealtimeConnected(status === 'SUBSCRIBED')
          if (status === 'CHANNEL_ERROR') {
            console.error('Supabase realtime channel error')
          }
        })
    } catch (err) {
      console.error('Supabase realtime connection error:', err)
    }

    return () => {
      if (channel) {
        channel.unsubscribe()
      }
    }
  }, [campaignId, scrollToBottom])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageContent.trim() || sending) return

    setSending(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageContent.trim(),
          messageType,
          characterName: messageType === 'ic' ? characterName : null,
        }),
      })

      if (res.ok) {
        const newMessage = await res.json()
        // Add message immediately (Supabase will also notify, but we check for duplicates)
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMessage.id)) {
            return prev
          }
          return [...prev, newMessage]
        })
        setMessageContent('')
        inputRef.current?.focus()
        setTimeout(scrollToBottom, 100)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send message')
      }
    } catch (err) {
      setError('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <Card className="h-[600px] flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading chat...</span>
        </div>
      </Card>
    )
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[hsl(45_80%_45%)]" />
          Party Chat
          {realtimeConnected && (
            <span className="w-2 h-2 bg-green-500 rounded-full" title="Connected" />
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
        {/* Messages Area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 space-y-3"
        >
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.user.id === currentUserId}
                getInitials={getInitials}
                formatTime={formatTime}
              />
            ))
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm text-center">
            {error}
          </div>
        )}

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="shrink-0 p-4 border-t space-y-3">
          {/* Message Type Toggle */}
          <div className="flex items-center gap-3">
            <Tabs
              value={messageType}
              onValueChange={(v) => setMessageType(v as 'ooc' | 'ic')}
              className="w-auto"
            >
              <TabsList className="h-8">
                <TabsTrigger value="ooc" className="text-xs px-3 h-6 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  OOC
                </TabsTrigger>
                <TabsTrigger value="ic" className="text-xs px-3 h-6 flex items-center gap-1">
                  <Theater className="h-3 w-3" />
                  IC
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Character Name Input (only for IC) */}
            {messageType === 'ic' && (
              <Input
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Character name"
                className="w-40 h-8 text-sm"
              />
            )}
          </div>

          {/* Message Input */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              placeholder={messageType === 'ic' ? 'Speak in character...' : 'Type a message...'}
              className="flex-1"
              disabled={sending}
              maxLength={2000}
            />
            <Button type="submit" disabled={!messageContent.trim() || sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// Message Bubble Component
function MessageBubble({
  message,
  isOwn,
  getInitials,
  formatTime,
}: {
  message: ChatMessage
  isOwn: boolean
  getInitials: (name: string | null) => string
  formatTime: (dateStr: string) => string
}) {
  const isIC = message.messageType === 'ic'
  const isSystem = message.messageType === 'system'

  if (isSystem) {
    return (
      <div className="text-center py-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={message.user.image || undefined} />
        <AvatarFallback className="text-xs">
          {getInitials(message.user.name)}
        </AvatarFallback>
      </Avatar>

      <div className={`max-w-[70%] ${isOwn ? 'text-right' : ''}`}>
        <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-sm font-medium">
            {isIC && message.characterName ? (
              <span className="italic">{message.characterName}</span>
            ) : (
              message.user.name || 'Unknown'
            )}
          </span>
          {isIC && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              IC
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        </div>

        <div
          className={`rounded-lg px-3 py-2 inline-block ${
            isOwn
              ? 'bg-primary text-primary-foreground'
              : isIC
              ? 'bg-purple-500/10 border border-purple-500/20'
              : 'bg-muted'
          } ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
        >
          {isIC ? (
            <p className="italic">
              <Quote className="inline h-3 w-3 mr-1 opacity-50" />
              {message.content}
            </p>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
      </div>
    </div>
  )
}
