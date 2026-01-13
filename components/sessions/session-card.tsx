import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Entity } from '@/lib/db/schema'
import { Lock, Calendar, BookOpen, Check, Circle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionCardProps {
  session: Entity
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
        label: 'Completed',
        className: 'bg-green-500/10 text-green-600 border-green-500/20',
      }
    case 'planned':
      return {
        icon: Circle,
        label: 'Planned',
        className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      }
    case 'cancelled':
      return {
        icon: X,
        label: 'Cancelled',
        className: 'bg-red-500/10 text-red-600 border-red-500/20 line-through',
      }
    default:
      return {
        icon: Circle,
        label: 'Unknown',
        className: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
      }
  }
}

export function SessionCard({ session, campaignId }: SessionCardProps) {
  const statusConfig = getStatusConfig(session.sessionStatus)
  const StatusIcon = statusConfig.icon

  // Get first 200 chars of content for preview
  const preview = (session.content || '')
    .replace(/[#*_\[\]]/g, '')
    .slice(0, 200)
    .trim()

  return (
    <Link href={`/campaigns/${campaignId}/entities/${session.id}`}>
      <Card
        className={cn(
          'hover:border-primary transition-colors cursor-pointer',
          session.sessionStatus === 'cancelled' && 'opacity-60'
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {session.sessionNumber && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {session.sessionNumber}
                </div>
              )}
              <div>
                <h3 className="font-semibold line-clamp-1">{session.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  {session.sessionDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(session.sessionDate)}
                    </span>
                  )}
                  {session.inGameDate && (
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {session.inGameDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {session.isDmOnly && (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant="outline" className={statusConfig.className}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {preview || 'No recap yet'}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
