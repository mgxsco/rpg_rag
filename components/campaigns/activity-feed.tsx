'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  FileText,
  Plus,
  Edit,
  UserPlus,
  CalendarPlus,
  Loader2,
} from 'lucide-react'

interface ActivityItem {
  type: 'entity_created' | 'entity_updated' | 'document_uploaded' | 'session_added' | 'member_joined'
  entityId?: string
  entityName?: string
  entityType?: string
  documentId?: string
  documentName?: string
  userId?: string
  userName?: string
  userImage?: string | null
  timestamp: string
}

interface ActivityFeedProps {
  campaignId: string
  limit?: number
}

export function ActivityFeed({ campaignId, limit = 10 }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActivities()
  }, [campaignId])

  const fetchActivities = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/activity?limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities || [])
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err)
    } finally {
      setLoading(false)
    }
  }

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'entity_created':
        return <Plus className="h-4 w-4 text-green-500" />
      case 'entity_updated':
        return <Edit className="h-4 w-4 text-blue-500" />
      case 'document_uploaded':
        return <FileText className="h-4 w-4 text-purple-500" />
      case 'session_added':
        return <CalendarPlus className="h-4 w-4 text-[hsl(45_80%_45%)]" />
      case 'member_joined':
        return <UserPlus className="h-4 w-4 text-cyan-500" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getActivityText = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'entity_created':
        return (
          <>
            New <Badge variant="outline" className="text-xs mx-1">{activity.entityType?.replace('_', ' ')}</Badge>
            <Link
              href={`/campaigns/${campaignId}/entities/${activity.entityId}`}
              className="font-medium hover:underline"
            >
              {activity.entityName}
            </Link>
          </>
        )
      case 'entity_updated':
        return (
          <>
            Updated{' '}
            <Link
              href={`/campaigns/${campaignId}/entities/${activity.entityId}`}
              className="font-medium hover:underline"
            >
              {activity.entityName}
            </Link>
          </>
        )
      case 'document_uploaded':
        return (
          <>
            <span className="font-medium">{activity.userName}</span> uploaded{' '}
            <span className="font-medium">{activity.documentName}</span>
          </>
        )
      case 'session_added':
        return (
          <>
            New session{' '}
            <Link
              href={`/campaigns/${campaignId}/entities/${activity.entityId}`}
              className="font-medium hover:underline"
            >
              {activity.entityName}
            </Link>
          </>
        )
      case 'member_joined':
        return (
          <>
            <span className="font-medium">{activity.userName}</span> joined the campaign
          </>
        )
      default:
        return 'Activity occurred'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-[hsl(45_80%_45%)]" />
          Recent Activity
        </CardTitle>
        <CardDescription>What's happening in your campaign</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, index) => (
              <div
                key={`${activity.type}-${activity.entityId || activity.documentId || activity.userId}-${index}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="mt-0.5 p-1.5 rounded-full bg-muted">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">
                    {getActivityText(activity)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatTimestamp(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
