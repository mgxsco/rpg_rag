'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { PartyPanel } from '@/components/campaigns/party-panel'
import { InviteModal } from '@/components/campaigns/invite-modal'
import { CampaignSpotlight } from '@/components/campaigns/campaign-spotlight'
import { SessionTimeline } from '@/components/campaigns/session-timeline'
import { ActivityFeed } from '@/components/campaigns/activity-feed'
import { MiniGraph } from '@/components/campaigns/mini-graph'
import { PCCards } from '@/components/campaigns/pc-cards'
import { QuestTracker } from '@/components/campaigns/quest-tracker'
import {
  BookOpen,
  MessageSquare,
  Network,
  Users,
  FileText,
  Plus,
  Upload,
  Scroll,
  Crown,
  Globe,
  Calendar,
  CalendarDays,
  Loader2,
  Settings,
  ChevronRight,
} from 'lucide-react'

interface CampaignData {
  id: string
  name: string
  description: string | null
  language: string
  createdAt: string
  ownerId: string
  currentUserId: string
  owner: {
    id: string
    name: string | null
    image: string | null
  }
  members: Array<{
    id: string
    userId: string
    role: 'dm' | 'player' | 'viewer'
    user: {
      id: string
      name: string | null
      image: string | null
    }
  }>
  isDM: boolean
  userRole: string
}

interface StatsData {
  entityCount: number
  relationshipCount: number
  documentCount: number
  memberCount: number
}

export default function CampaignHomePage() {
  const params = useParams<{ campaignId: string }>()
  const router = useRouter()
  const campaignId = params.campaignId

  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [campaignId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [campaignRes, statsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`),
        fetch(`/api/campaigns/${campaignId}/stats`),
      ])

      if (campaignRes.ok) {
        const campaignData = await campaignRes.json()
        setCampaign(campaignData)
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }
    } catch (error) {
      console.error('Failed to load campaign data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: 'dm' | 'player' | 'viewer') => {
    try {
      await fetch(`/api/campaigns/${campaignId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      loadData()
    } catch (error) {
      console.error('Failed to update role:', error)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      await fetch(`/api/campaigns/${campaignId}/members/${userId}`, {
        method: 'DELETE',
      })
      loadData()
    } catch (error) {
      console.error('Failed to remove member:', error)
    }
  }

  const handleLeaveCampaign = async () => {
    try {
      await fetch(`/api/campaigns/${campaignId}/members/me`, {
        method: 'DELETE',
      })
      router.push('/campaigns')
    } catch (error) {
      console.error('Failed to leave campaign:', error)
    }
  }

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

  const isDM = campaign.isDM

  const partyMembers = [
    {
      id: campaign.owner.id,
      userId: campaign.owner.id,
      userName: campaign.owner.name,
      userImage: campaign.owner.image,
      role: 'dm' as const,
    },
    ...campaign.members
      .filter((m) => m.userId !== campaign.ownerId)
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.user.name,
        userImage: m.user.image,
        role: m.role,
      })),
  ]

  const currentUserId = campaign.currentUserId

  return (
    <div className="flex flex-col md:flex-row gap-3 sm:gap-4 md:gap-5">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 space-y-4 sm:space-y-5">
        {/* Campaign Header */}
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'Cinzel, serif' }}>
                  {campaign.name}
                </h1>
                <Badge variant={isDM ? 'default' : 'secondary'} className="flex items-center gap-1">
                  {isDM && <Crown className="h-3 w-3" />}
                  {isDM ? 'Dungeon Master' : campaign.userRole.toUpperCase()}
                </Badge>
              </div>
              {campaign.description && (
                <p className="text-muted-foreground mb-3">{campaign.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Globe className="h-4 w-4" />
                  {campaign.language === 'en' ? 'English' : campaign.language === 'pt-BR' ? 'Português (BR)' : campaign.language}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Created {new Date(campaign.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            {isDM && (
              <Link href={`/campaigns/${campaignId}/settings`}>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Campaign Spotlight - AI Summary */}
        <CampaignSpotlight campaignId={campaignId} />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            icon={<BookOpen className="h-5 w-5" />}
            label="Wiki Entries"
            value={stats?.entityCount ?? 0}
            href={`/campaigns/${campaignId}/entities`}
          />
          <StatCard
            icon={<Network className="h-5 w-5" />}
            label="Connections"
            value={stats?.relationshipCount ?? 0}
            href={`/campaigns/${campaignId}/graph`}
          />
          <StatCard
            icon={<FileText className="h-5 w-5" />}
            label="Documents"
            value={stats?.documentCount ?? 0}
            href={`/campaigns/${campaignId}/entities`}
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Party Members"
            value={partyMembers.length}
            href={isDM ? `/campaigns/${campaignId}/settings` : '#'}
          />
        </div>

        {/* Session Timeline */}
        <SessionTimeline campaignId={campaignId} isDM={isDM} />

        {/* Two Column Layout: Activity Feed + Mini Graph */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <ActivityFeed campaignId={campaignId} limit={8} />
          <MiniGraph campaignId={campaignId} />
        </div>

        {/* Two Column Layout: PC Cards + Quest Tracker */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <PCCards campaignId={campaignId} />
          <QuestTracker campaignId={campaignId} />
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scroll className="h-5 w-5 text-[hsl(45_80%_45%)]" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks for your campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Link href={`/campaigns/${campaignId}/entities?upload=true`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                  <Upload className="h-5 w-5" />
                  <span className="text-xs">Upload</span>
                </Button>
              </Link>
              <Link href={`/campaigns/${campaignId}/entities/new`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                  <Plus className="h-5 w-5" />
                  <span className="text-xs">Create</span>
                </Button>
              </Link>
              <Link href={`/campaigns/${campaignId}/chat`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-xs">Chat</span>
                </Button>
              </Link>
              <Link href={`/campaigns/${campaignId}/graph`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                  <Network className="h-5 w-5" />
                  <span className="text-xs">Graph</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Party Panel */}
        <PartyPanel
          campaignId={campaignId}
          members={partyMembers}
          ownerId={campaign.ownerId}
          currentUserId={currentUserId}
          isDM={isDM}
          onInvite={() => setInviteModalOpen(true)}
          onRoleChange={isDM ? handleRoleChange : undefined}
          onRemoveMember={isDM ? handleRemoveMember : undefined}
          onLeave={!isDM ? handleLeaveCampaign : undefined}
        />
      </div>

      {/* Invite Modal */}
      <InviteModal
        campaignId={campaignId}
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
      />
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  href: string
}) {
  const content = (
    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="text-[hsl(45_80%_45%)]">{icon}</div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (href === '#') {
    return content
  }

  return <Link href={href}>{content}</Link>
}
