import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Entity } from '@/lib/db/schema'
import { Lock, User, MapPin, Sword, Scroll, Users, BookOpen, Crown } from 'lucide-react'

interface EntityCardProps {
  entity: Entity
  campaignId: string
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  npc: User,
  location: MapPin,
  item: Sword,
  quest: Scroll,
  faction: Users,
  lore: BookOpen,
  session: BookOpen,
  player_character: Crown,
  freeform: BookOpen,
}

const TYPE_COLORS: Record<string, string> = {
  npc: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  location: 'bg-green-500/10 text-green-500 border-green-500/20',
  item: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  quest: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  faction: 'bg-red-500/10 text-red-500 border-red-500/20',
  lore: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  session: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  player_character: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  freeform: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

export function EntityCard({ entity, campaignId }: EntityCardProps) {
  const Icon = TYPE_ICONS[entity.entityType] || BookOpen
  const typeColor = TYPE_COLORS[entity.entityType] || TYPE_COLORS.freeform

  // Get first 150 chars of content for preview
  const preview = (entity.content || '')
    .replace(/[#*_\[\]]/g, '')
    .slice(0, 150)
    .trim()

  return (
    <Link href={`/campaigns/${campaignId}/entities/${entity.id}`}>
      <Card className="hover:border-primary transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg line-clamp-1">{entity.name}</CardTitle>
            </div>
            {entity.isDmOnly && (
              <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className={typeColor}>
              {entity.entityType.replace('_', ' ')}
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
  )
}
