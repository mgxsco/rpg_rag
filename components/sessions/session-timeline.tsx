import Link from 'next/link'
import { Entity } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Lock, Calendar, BookOpen, Check, Circle, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionTimelineProps {
  sessions: Entity[]
  campaignId: string
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusConfig(status: string | null) {
  switch (status) {
    case 'completed':
      return {
        icon: Check,
        dotClass: 'bg-green-500 border-green-500',
        lineClass: 'bg-green-500/30',
      }
    case 'planned':
      return {
        icon: Circle,
        dotClass: 'bg-blue-500 border-blue-500 border-dashed',
        lineClass: 'bg-blue-500/30 border-dashed',
      }
    case 'cancelled':
      return {
        icon: X,
        dotClass: 'bg-red-500/50 border-red-500/50',
        lineClass: 'bg-red-500/20',
      }
    default:
      return {
        icon: Circle,
        dotClass: 'bg-gray-500 border-gray-500',
        lineClass: 'bg-gray-500/30',
      }
  }
}

export function SessionTimeline({ sessions, campaignId }: SessionTimelineProps) {
  if (sessions.length === 0) {
    return null
  }

  return (
    <div className="relative">
      {sessions.map((session, index) => {
        const statusConfig = getStatusConfig(session.sessionStatus)
        const StatusIcon = statusConfig.icon
        const isLast = index === sessions.length - 1
        const isCancelled = session.sessionStatus === 'cancelled'

        // Get first 150 chars of content for preview
        const preview = (session.content || '')
          .replace(/[#*_\[\]]/g, '')
          .slice(0, 150)
          .trim()

        return (
          <div key={session.id} className="relative pl-8 pb-8 last:pb-0">
            {/* Timeline line */}
            {!isLast && (
              <div
                className={cn(
                  'absolute left-[11px] top-6 w-0.5 h-full',
                  statusConfig.lineClass
                )}
              />
            )}

            {/* Timeline dot */}
            <div
              className={cn(
                'absolute left-0 top-1 w-6 h-6 rounded-full border-2 flex items-center justify-center',
                statusConfig.dotClass
              )}
            >
              <StatusIcon className="h-3 w-3 text-white" />
            </div>

            {/* Session content */}
            <Link
              href={`/campaigns/${campaignId}/entities/${session.id}`}
              className="block group"
            >
              <div
                className={cn(
                  'border rounded-lg p-4 hover:border-primary transition-colors',
                  isCancelled && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {session.sessionNumber && (
                      <Badge variant="secondary" className="font-mono">
                        #{session.sessionNumber}
                      </Badge>
                    )}
                    <h3
                      className={cn(
                        'font-semibold group-hover:text-primary transition-colors',
                        isCancelled && 'line-through'
                      )}
                    >
                      {session.name}
                    </h3>
                    {session.isDmOnly && (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Dates */}
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-2">
                  {session.sessionDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(session.sessionDate)}
                    </span>
                  )}
                  {session.inGameDate && (
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {session.inGameDate}
                    </span>
                  )}
                </div>

                {/* Preview */}
                {preview && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {preview}
                  </p>
                )}
              </div>
            </Link>
          </div>
        )
      })}
    </div>
  )
}
