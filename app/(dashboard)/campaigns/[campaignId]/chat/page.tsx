'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { ChatInterface, ChatMode } from '@/components/chat/chat-interface'
import { ChatMessage } from '@/lib/types'

export default function ChatPage({
  params,
}: {
  params: { campaignId: string }
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isDM, setIsDM] = useState(false)
  const [loading, setLoading] = useState(true)
  const { data: session } = useSession()

  useEffect(() => {
    const loadCampaignData = async () => {
      if (!session?.user) return

      try {
        const res = await fetch(`/api/campaigns/${params.campaignId}`)
        if (res.ok) {
          const data = await res.json()
          setIsDM(data.isDM)
        }
      } catch (error) {
        console.error('Failed to load campaign:', error)
      }
      setLoading(false)
    }

    loadCampaignData()
  }, [params.campaignId, session])

  const handleSendMessage = async (content: string, mode: ChatMode = 'rag') => {
    const userMessage: ChatMessage = { role: 'user', content }
    setMessages((prev) => [...prev, userMessage])

    try {
      const response = await fetch(`/api/campaigns/${params.campaignId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: messages,
          mode,
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Handle direct mode: show search results without AI response
      let responseContent = data.content
      if (data.mode === 'direct' && !data.content) {
        if (data.sources && data.sources.length > 0) {
          responseContent = `Found ${data.sources.length} matching result${data.sources.length === 1 ? '' : 's'}:`
        } else {
          responseContent = 'No matching results found. Try different search terms.'
        }
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: responseContent,
        sources: data.sources,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
      }
      setMessages((prev) => [...prev, errorMessage])
    }
  }

  const handleClearHistory = () => {
    setMessages([])
  }

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row gap-6">
        <CampaignSidebar campaignId={params.campaignId} isDM={false} />
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0">
        <div className="mb-4 md:mb-6">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <span>🗿</span> Barão Pedregulho
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Consulte o sábio (ranzinza) aprisionado na pedra mágica. Ele sabe de tudo... e vai reclamar muito.
          </p>
        </div>

        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          onClearHistory={handleClearHistory}
          campaignId={params.campaignId}
        />
      </div>
    </div>
  )
}
