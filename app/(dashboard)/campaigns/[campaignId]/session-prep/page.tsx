'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useParams } from 'next/navigation'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, RefreshCw, Loader2, CalendarDays, Swords, Users } from 'lucide-react'

export default function SessionPrepPage() {
  const params = useParams<{ campaignId: string }>()
  const campaignId = params.campaignId!
  const [isDM, setIsDM] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [prepContent, setPrepContent] = useState<string | null>(null)
  const [contextStats, setContextStats] = useState<{
    sessionsCount: number
    questsCount: number
    npcsCount: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entityMap, setEntityMap] = useState<Map<string, string>>(new Map())
  const { data: session } = useSession()

  useEffect(() => {
    const loadData = async () => {
      if (!session?.user) return

      try {
        // Load campaign data
        const res = await fetch(`/api/campaigns/${campaignId}`)
        if (res.ok) {
          const data = await res.json()
          setIsDM(data.isDM)
        }

        // Load entities for wikilink resolution
        const entitiesRes = await fetch(`/api/campaigns/${campaignId}/entities?limit=500`)
        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json()
          const map = new Map<string, string>()
          entitiesData.entities.forEach((e: { id: string; name: string }) => {
            map.set(e.name.toLowerCase(), e.id)
          })
          setEntityMap(map)
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      }
      setLoading(false)
    }

    loadData()
  }, [campaignId, session])

  const generatePrep = async () => {
    setGenerating(true)
    setError(null)

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '',
          history: [],
          mode: 'session-prep',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to generate session prep')
      }

      const data = await res.json()
      setPrepContent(data.content)
      setContextStats(data.context)
    } catch (error) {
      console.error('Session prep error:', error)
      setError('Failed to generate session prep. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row gap-6">
        <CampaignSidebar campaignId={campaignId} isDM={isDM} />
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            Session Prep
          </h1>
          <p className="text-muted-foreground">
            Get a quick recap of what you need to know for tonight's session
          </p>
        </div>

        {!prepContent && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Ready for Tonight?</CardTitle>
              <CardDescription>
                Generate an AI-powered summary of recent sessions, active quests, and key NPCs
                to help you prepare for your next game.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={generatePrep} disabled={generating} size="lg">
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Session Prep
                  </>
                )}
              </Button>
              {error && <p className="text-destructive mt-4">{error}</p>}
            </CardContent>
          </Card>
        )}

        {prepContent && (
          <>
            {/* Context Stats */}
            {contextStats && (
              <div className="flex flex-wrap gap-4 mb-6">
                <Badge variant="outline" className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {contextStats.sessionsCount} recent sessions
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Swords className="h-3 w-3" />
                  {contextStats.questsCount} active quests
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {contextStats.npcsCount} key NPCs
                </Badge>
              </div>
            )}

            {/* Regenerate Button */}
            <div className="flex justify-end mb-4">
              <Button variant="outline" onClick={generatePrep} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Regenerate
              </Button>
            </div>

            {/* Content */}
            <Card>
              <CardContent className="pt-6">
                <MarkdownRenderer
                  content={prepContent}
                  campaignId={campaignId}
                  noteMap={entityMap}
                  isEntityMode={true}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
