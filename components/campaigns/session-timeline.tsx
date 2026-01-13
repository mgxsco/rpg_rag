'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  CalendarDays,
  Check,
  Circle,
  Clock,
  ChevronRight,
  Plus,
  Loader2,
} from 'lucide-react'

interface Session {
  id: string
  name: string
  sessionNumber: number | null
  sessionDate: string | null
  inGameDate: string | null
  sessionStatus: string | null
}

interface SessionTimelineProps {
  campaignId: string
  isDM: boolean
}

export function SessionTimeline({ campaignId, isDM }: SessionTimelineProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
  }, [campaignId])

  const fetchSessions = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sessions?sort=number&order=asc`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500'
      case 'planned':
        return 'bg-blue-500'
      case 'in_progress':
        return 'bg-yellow-500'
      default:
        return 'bg-muted-foreground'
    }
  }

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'completed':
        return <Check className="h-3 w-3 text-white" />
      case 'planned':
        return <Clock className="h-3 w-3 text-white" />
      case 'in_progress':
        return <Circle className="h-3 w-3 text-white animate-pulse" />
      default:
        return <Circle className="h-3 w-3 text-white" />
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            Session Timeline
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

  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[hsl(45_80%_45%)]" />
              Session Timeline
            </CardTitle>
            <CardDescription>Your adventure's journey</CardDescription>
          </div>
          {isDM && (
            <Link href={`/campaigns/${campaignId}/sessions/new`}>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                First Session
              </Button>
            </Link>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No sessions yet</p>
            <p className="text-xs mt-1">Start recording your adventure!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            Session Timeline
          </CardTitle>
          <CardDescription>{sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/campaigns/${campaignId}/sessions`}>
            <Button variant="outline" size="sm">
              View All
            </Button>
          </Link>
          {isDM && (
            <Link href={`/campaigns/${campaignId}/sessions/new`}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="flex items-center gap-1 pb-4 pt-2">
            {sessions.map((session, index) => (
              <div key={session.id} className="flex items-center">
                <Link
                  href={`/campaigns/${campaignId}/entities/${session.id}`}
                  className="flex flex-col items-center group"
                >
                  {/* Node */}
                  <div
                    className={`relative w-10 h-10 rounded-full ${getStatusColor(session.sessionStatus)}
                      flex items-center justify-center shadow-md
                      group-hover:ring-2 group-hover:ring-primary group-hover:ring-offset-2
                      transition-all duration-200`}
                  >
                    {session.sessionNumber ? (
                      <span className="text-xs font-bold text-white">
                        {session.sessionNumber}
                      </span>
                    ) : (
                      getStatusIcon(session.sessionStatus)
                    )}
                  </div>
                  {/* Label */}
                  <div className="mt-2 text-center max-w-[80px]">
                    <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                      {session.name.length > 12
                        ? session.name.slice(0, 12) + '...'
                        : session.name}
                    </p>
                    {session.sessionDate && (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(session.sessionDate).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </Link>

                {/* Connector line */}
                {index < sessions.length - 1 && (
                  <div className="w-8 h-0.5 bg-muted mx-1 mt-[-20px]" />
                )}
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Planned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>In Progress</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
