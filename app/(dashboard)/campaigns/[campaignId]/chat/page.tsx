'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { ChatInterface } from '@/components/chat/chat-interface'
import { ChatMessage } from '@/lib/types'

export default function ChatPage({
  params,
}: {
  params: { campaignId: string }
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isDM, setIsDM] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadCampaignData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: campaign } = await supabase
        .from('campaigns')
        .select('name, owner_id')
        .eq('id', params.campaignId)
        .single()

      const { data: membership } = await supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', params.campaignId)
        .eq('user_id', user.id)
        .single()

      setCampaignName(campaign?.name || '')
      setIsDM(membership?.role === 'dm' || campaign?.owner_id === user.id)
      setLoading(false)
    }

    loadCampaignData()
  }, [params.campaignId, supabase])

  const handleSendMessage = async (content: string) => {
    const userMessage: ChatMessage = { role: 'user', content }
    setMessages((prev) => [...prev, userMessage])

    try {
      const response = await fetch(`/api/campaigns/${params.campaignId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: messages,
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.content,
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
      <div className="flex gap-6">
        <CampaignSidebar campaignId={params.campaignId} isDM={false} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Campaign AI Assistant</h1>
          <p className="text-muted-foreground">
            Ask questions about your campaign. The AI will search through your notes to find answers.
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
