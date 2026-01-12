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
  Loader2,
  Settings,
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

interface EntityCount {
  type: string
  count: number
}

interface RecentEntity {
  id: string
  name: string
  entityType: string
  updatedAt: string
}

interface RecentDocument {
  id: string
  name: string
  fileType: string | null
  createdAt: string
  uploadedBy: {
    name: string | null
  }
}

interface StatsData {
  entityCount: number
  relationshipCount: number
  documentCount: number
  memberCount: number
  entityCounts: EntityCount[]
  recentEntities: RecentEntity[]
  recentDocuments: RecentDocument[]
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
      // Load campaign data and stats in parallel
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
      loadData() // Refresh data
    } catch (error) {
      console.error('Failed to update role:', error)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      await fetch(`/api/campaigns/${campaignId}/members/${userId}`, {
        method: 'DELETE',
      })
      loadData() // Refresh data
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
      <div className="flex flex-col md:flex-row gap-6">
        <div className="hidden md:block w-64 shrink-0" />
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col md:flex-row gap-6">
        <div className="hidden md:block w-64 shrink-0" />
        <div className="flex-1 text-center py-20">
          <p className="text-muted-foreground">Campaign not found</p>
        </div>
      </div>
    )
  }

  const isDM = campaign.isDM

  // Prepare members for PartyPanel
  const partyMembers = [
    // Add owner as DM
    {
      id: campaign.owner.id,
      userId: campaign.owner.id,
      userName: campaign.owner.name,
      userImage: campaign.owner.image,
      role: 'dm' as const,
    },
    // Add other members (excluding owner if they're in members list)
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

  // Get current user ID from the API response
  const currentUserId = campaign.currentUserId

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 space-y-6">
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

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Scroll className="h-5 w-5 text-[hsl(45_80%_45%)]" />
                  Adventurer's Toolkit
                </CardTitle>
                <CardDescription>Common tasks for your campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href={`/campaigns/${campaignId}/entities?upload=true`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Documents
                  </Button>
                </Link>
                <Link href={`/campaigns/${campaignId}/entities/new`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Wiki Entry
                  </Button>
                </Link>
                <Link href={`/campaigns/${campaignId}/chat`}>
                  <Button variant="outline" className="w-full justify-start">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Consult the Oracle (AI)
                  </Button>
                </Link>
                <Link href={`/campaigns/${campaignId}/graph`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Network className="h-4 w-4 mr-2" />
                    View Knowledge Graph
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Recent Documents */}
            {stats && stats.recentDocuments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[hsl(45_80%_45%)]" />
                    Archived Scrolls
                  </CardTitle>
                  <CardDescription>Recently uploaded documents</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.recentDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Scroll className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate">{doc.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Wiki Summary */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-[hsl(45_80%_45%)]" />
                    Compendium
                  </CardTitle>
                  <CardDescription>Your campaign knowledge base</CardDescription>
                </div>
                <Link href={`/campaigns/${campaignId}/entities`}>
                  <Button size="sm" variant="outline">
                    Browse
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {stats && stats.entityCounts.length > 0 ? (
                  <div className="space-y-4">
                    {/* Entity type breakdown */}
                    <div className="space-y-2">
                      {stats.entityCounts.slice(0, 5).map((item) => {
                        const maxCount = Math.max(...stats.entityCounts.map((e) => e.count))
                        const percentage = (item.count / maxCount) * 100
                        return (
                          <div key={item.type} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">
                                {item.type.replace('_', ' ')}
                              </span>
                              <span className="text-muted-foreground">{item.count}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary to-[hsl(45_80%_45%)] rounded-full transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Recent entities */}
                    {stats.recentEntities.length > 0 && (
                      <div className="pt-4 border-t">
                        <h4 className="text-sm font-medium mb-2">Recently Updated</h4>
                        <div className="space-y-1">
                          {stats.recentEntities.map((entity) => (
                            <Link
                              key={entity.id}
                              href={`/campaigns/${campaignId}/entities/${entity.id}`}
                              className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50 transition-colors text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className="shrink-0 text-xs">
                                  {entity.entityType.replace('_', ' ')}
                                </Badge>
                                <span className="truncate">{entity.name}</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No entries yet.</p>
                    <p className="text-sm">Upload documents to extract entities automatically.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
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
