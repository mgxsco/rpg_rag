'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { CampaignChat } from '@/components/campaigns/campaign-chat'
import { ErrorBoundary, ChatErrorFallback } from '@/components/ui/error-boundary'
import { Loader2 } from 'lucide-react'

interface CampaignData {
  id: string
  name: string
  currentUserId: string
  isDM: boolean
}

export default function PartyChatPage() {
  const params = useParams<{ campaignId: string }>()
  const campaignId = params.campaignId

  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadCampaign = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`)
        if (res.ok) {
          const data = await res.json()
          setCampaign(data)
        }
      } catch (error) {
        console.error('Failed to load campaign:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCampaign()
  }, [campaignId])

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row gap-3 sm:gap-4 md:gap-5">
        <div className="hidden md:block w-52 lg:w-56 xl:w-60 shrink-0" />
        <div className="flex-1 min-w-0 flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col md:flex-row gap-3 sm:gap-4 md:gap-5">
        <div className="hidden md:block w-52 lg:w-56 xl:w-60 shrink-0" />
        <div className="flex-1 min-w-0 text-center py-12">
          <p className="text-muted-foreground">Campaign not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 sm:gap-4 md:gap-5">
      <CampaignSidebar campaignId={campaignId} isDM={campaign.isDM} />

      <div className="flex-1 min-w-0">
        <ErrorBoundary fallback={<ChatErrorFallback />}>
          <CampaignChat campaignId={campaignId} currentUserId={campaign.currentUserId} />
        </ErrorBoundary>
      </div>
    </div>
  )
}
