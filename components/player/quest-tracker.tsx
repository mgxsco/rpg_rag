'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import {
  Swords,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Circle,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import { Entity, QuestStatus } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

interface QuestTrackerProps {
  campaignId: string
  quests: Entity[]
  stats: {
    active: number
    completed: number
    failed: number
    abandoned: number
    total: number
  }
  isDM: boolean
  entityMap: Map<string, string>
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  active: { label: 'Active', icon: Circle, color: 'text-blue-500' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-500' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500' },
  abandoned: { label: 'Abandoned', icon: AlertCircle, color: 'text-muted-foreground' },
}

export function QuestTracker({
  campaignId,
  quests: initialQuests,
  stats,
  isDM,
  entityMap,
}: QuestTrackerProps) {
  const [quests, setQuests] = useState(initialQuests)
  const [filter, setFilter] = useState<string>('all')
  const [expandedQuest, setExpandedQuest] = useState<string | null>(null)

  const filteredQuests =
    filter === 'all' ? quests : quests.filter((q) => (q.questStatus || 'active') === filter)

  const handleStatusChange = async (questId: string, newStatus: QuestStatus) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/quests`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId, questStatus: newStatus }),
      })

      if (res.ok) {
        const updated = await res.json()
        setQuests(quests.map((q) => (q.id === questId ? updated : q)))
      }
    } catch (error) {
      console.error('Failed to update quest status:', error)
    }
  }

  const getStatusConfig = (status: string | null) => {
    return STATUS_CONFIG[status || 'active'] || STATUS_CONFIG.active
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-blue-500" onClick={() => setFilter('active')}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
              <Circle className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-500" onClick={() => setFilter('completed')}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-red-500" onClick={() => setFilter('failed')}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold">{stats.failed}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-muted" onClick={() => setFilter('abandoned')}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Abandoned</p>
                <p className="text-2xl font-bold">{stats.abandoned}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter quests" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Quests ({stats.total})</SelectItem>
            <SelectItem value="active">Active ({stats.active})</SelectItem>
            <SelectItem value="completed">Completed ({stats.completed})</SelectItem>
            <SelectItem value="failed">Failed ({stats.failed})</SelectItem>
            <SelectItem value="abandoned">Abandoned ({stats.abandoned})</SelectItem>
          </SelectContent>
        </Select>
        {filter !== 'all' && (
          <Button variant="ghost" size="sm" onClick={() => setFilter('all')}>
            Clear filter
          </Button>
        )}
      </div>

      {/* Quest List */}
      <div className="space-y-4">
        {filteredQuests.map((quest) => {
          const statusConfig = getStatusConfig(quest.questStatus)
          const StatusIcon = statusConfig.icon
          const isExpanded = expandedQuest === quest.id

          return (
            <Card key={quest.id} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setExpandedQuest(isExpanded ? null : quest.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <StatusIcon className={cn('h-5 w-5 mt-0.5 shrink-0', statusConfig.color)} />
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{quest.name}</CardTitle>
                      {quest.content && (
                        <CardDescription className="mt-1 line-clamp-2">
                          {quest.content.slice(0, 200)}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={statusConfig.color}>
                      {statusConfig.label}
                    </Badge>
                    {isDM && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleStatusChange(quest.id, 'active')}>
                            <Circle className="h-4 w-4 mr-2 text-blue-500" />
                            Mark Active
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(quest.id, 'completed')}>
                            <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                            Mark Completed
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(quest.id, 'failed')}>
                            <XCircle className="h-4 w-4 mr-2 text-red-500" />
                            Mark Failed
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(quest.id, 'abandoned')}>
                            <AlertCircle className="h-4 w-4 mr-2" />
                            Mark Abandoned
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>
              {isExpanded && quest.content && (
                <CardContent className="pt-0 border-t">
                  <div className="pt-4">
                    <MarkdownRenderer
                      content={quest.content}
                      campaignId={campaignId}
                      noteMap={entityMap}
                      isEntityMode={true}
                    />
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <Link href={`/campaigns/${campaignId}/entities/${quest.id}`}>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Full Entry
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {filteredQuests.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Swords className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No quests found</h3>
          <p>
            {filter === 'all'
              ? 'No quests have been created yet'
              : `No ${filter} quests`}
          </p>
        </div>
      )}
    </div>
  )
}
