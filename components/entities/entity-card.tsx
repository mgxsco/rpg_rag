'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Entity } from '@/lib/db/schema'
import { Lock } from 'lucide-react'
import {
  getEntityTypeIcon,
  getEntityTypeBadgeClasses,
  getEntityTypeLabel,
} from '@/lib/entity-colors'
import { EntityActions } from './entity-actions'

interface EntityCardProps {
  entity: Entity
  campaignId: string
  isDM?: boolean
}

export function EntityCard({ entity, campaignId, isDM = false }: EntityCardProps) {
  const Icon = getEntityTypeIcon(entity.entityType)
  const typeClasses = getEntityTypeBadgeClasses(entity.entityType)

  // Get first 150 chars of content for preview
  const preview = (entity.content || '')
    .replace(/[#*_\[\]]/g, '')
    .slice(0, 150)
    .trim()

  return (
    <div className="relative group h-full">
      <Link href={`/campaigns/${campaignId}/entities/${entity.id}`}>
        <Card className="hover:border-primary transition-colors cursor-pointer h-full">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <CardTitle className="text-lg line-clamp-1">{entity.name}</CardTitle>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {entity.isDmOnly && (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className={typeClasses}>
                {getEntityTypeLabel(entity.entityType)}
              </Badge>
              {entity.tags?.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {entity.tags && entity.tags.length > 2 && (
                <Badge variant="secondary" className="text-xs">
                  +{entity.tags.length - 2}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {preview || 'No content'}
            </p>
            {entity.aliases && entity.aliases.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Also known as: {entity.aliases.slice(0, 2).join(', ')}
                {entity.aliases.length > 2 && ` +${entity.aliases.length - 2} more`}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Updated {new Date(entity.updatedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Actions dropdown - positioned in top right */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <EntityActions
          entityId={entity.id}
          entityName={entity.name}
          campaignId={campaignId}
          isDM={isDM}
        />
      </div>
    </div>
  )
}
