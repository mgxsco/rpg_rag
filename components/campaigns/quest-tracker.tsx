'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Swords,
  CheckCircle,
  Circle,
  Clock,
  ChevronRight,
  Loader2,
  Target,
} from 'lucide-react'

interface Quest {
  id: string
  name: string
  content: string | null
  tags: string[] | null
  updatedAt: string
}

interface QuestTrackerProps {
  campaignId: string
}

export function QuestTracker({ campaignId }: QuestTrackerProps) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchQuests()
  }, [campaignId])

  const fetchQuests = async () => {
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/entities?type=quest&limit=20`
      )
      if (res.ok) {
        const data = await res.json()
        setQuests(data.entities || [])
      }
    } catch (err) {
      console.error('Failed to fetch quests:', err)
    } finally {
      setLoading(false)
    }
  }

  // Determine quest status from tags or content
  const getQuestStatus = (quest: Quest): 'active' | 'completed' | 'failed' => {
    const tags = quest.tags?.map((t) => t.toLowerCase()) || []
    const content = quest.content?.toLowerCase() || ''

    if (tags.includes('completed') || tags.includes('done') || content.includes('[completed]')) {
      return 'completed'
    }
    if (tags.includes('failed') || content.includes('[failed]')) {
      return 'failed'
    }
    return 'active'
  }

  const getStatusIcon = (status: 'active' | 'completed' | 'failed') => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <Circle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: 'active' | 'completed' | 'failed') => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500 text-xs">Done</Badge>
      case 'failed':
        return <Badge variant="destructive" className="text-xs">Failed</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">Active</Badge>
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Swords className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            Quests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (quests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Swords className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            Quests
          </CardTitle>
          <CardDescription>Track your campaign objectives</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No quests yet</p>
            <p className="text-xs mt-1">Create quest entities to track here</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate stats
  const questsWithStatus = quests.map((q) => ({
    ...q,
    status: getQuestStatus(q),
  }))

  const activeQuests = questsWithStatus.filter((q) => q.status === 'active')
  const completedQuests = questsWithStatus.filter((q) => q.status === 'completed')
  const failedQuests = questsWithStatus.filter((q) => q.status === 'failed')

  const completionRate = quests.length > 0
    ? Math.round((completedQuests.length / quests.length) * 100)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Swords className="h-5 w-5 text-[hsl(45_80%_45%)]" />
          Quests
        </CardTitle>
        <CardDescription>
          {activeQuests.length} active, {completedQuests.length} completed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{completionRate}%</span>
          </div>
          <Progress value={completionRate} className="h-2" />
        </div>

        {/* Quest list */}
        <div className="space-y-1">
          {/* Show active quests first, then completed */}
          {[...activeQuests, ...completedQuests.slice(0, 3)].slice(0, 6).map((quest) => (
            <Link
              key={quest.id}
              href={`/campaigns/${campaignId}/entities/${quest.id}`}
              className="group"
            >
              <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                {getStatusIcon(quest.status)}
                <span
                  className={`flex-1 text-sm truncate group-hover:text-primary transition-colors ${
                    quest.status === 'completed' ? 'line-through text-muted-foreground' : ''
                  }`}
                >
                  {quest.name}
                </span>
                {getStatusBadge(quest.status)}
              </div>
            </Link>
          ))}

          {quests.length > 6 && (
            <Link
              href={`/campaigns/${campaignId}/entities?type=quest`}
              className="block text-center text-sm text-muted-foreground hover:text-primary py-2"
            >
              View all {quests.length} quests →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
