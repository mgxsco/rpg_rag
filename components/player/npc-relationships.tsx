'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Heart,
  HeartCrack,
  Minus,
  HelpCircle,
  Users,
  MapPin,
  Flag,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Entity } from '@/lib/db/schema'

interface RelationshipData {
  id: string
  relationshipType: string
  reverseLabel: string | null
  sentiment: string | null
  entity: {
    id: string
    name: string
    entityType: string
    content: string | null
    isDmOnly: boolean
  }
  direction: 'outgoing' | 'incoming'
}

interface NpcRelationshipsProps {
  campaignId: string
  characters: Entity[]
  isDM: boolean
}

const SENTIMENT_CONFIG = {
  friendly: { icon: Heart, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Friendly' },
  neutral: { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Neutral' },
  hostile: { icon: HeartCrack, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Hostile' },
  unknown: { icon: HelpCircle, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Unknown' },
}

const TYPE_ICONS = {
  npc: Users,
  location: MapPin,
  faction: Flag,
}

export function NpcRelationships({ campaignId, characters, isDM }: NpcRelationshipsProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<string>(characters[0]?.id || '')
  const [relationships, setRelationships] = useState<RelationshipData[]>([])
  const [stats, setStats] = useState<{
    total: number
    friendly: number
    neutral: number
    hostile: number
    npcs: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState('all')

  const loadRelationships = async (characterId: string) => {
    if (!characterId) return

    setLoading(true)
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/characters/${characterId}/relationships`
      )
      if (res.ok) {
        const data = await res.json()
        setRelationships(data.relationships)
        setStats(data.stats)
        setLoaded(true)
      }
    } catch (error) {
      console.error('Failed to load relationships:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCharacterChange = (characterId: string) => {
    setSelectedCharacter(characterId)
    setLoaded(false)
    loadRelationships(characterId)
  }

  // Filter relationships based on active tab
  const filteredRelationships = relationships.filter((rel) => {
    if (activeTab === 'all') return true
    if (activeTab === 'npcs') return rel.entity.entityType === 'npc'
    return (rel.sentiment || 'neutral') === activeTab
  })

  // Group by sentiment for the "all" view
  const groupedBySentiment = {
    friendly: relationships.filter((r) => r.sentiment === 'friendly'),
    hostile: relationships.filter((r) => r.sentiment === 'hostile'),
    neutral: relationships.filter((r) => r.sentiment === 'neutral' || !r.sentiment),
    unknown: relationships.filter((r) => r.sentiment === 'unknown'),
  }

  const getSentimentConfig = (sentiment: string | null) => {
    return SENTIMENT_CONFIG[sentiment as keyof typeof SENTIMENT_CONFIG] || SENTIMENT_CONFIG.neutral
  }

  const RelationshipCard = ({ rel }: { rel: RelationshipData }) => {
    const sentimentConfig = getSentimentConfig(rel.sentiment)
    const SentimentIcon = sentimentConfig.icon
    const TypeIcon = TYPE_ICONS[rel.entity.entityType as keyof typeof TYPE_ICONS] || Users

    return (
      <Card className="hover:border-primary transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <TypeIcon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{rel.entity.name}</CardTitle>
            </div>
            <div className={cn('p-1.5 rounded', sentimentConfig.bg)}>
              <SentimentIcon className={cn('h-4 w-4', sentimentConfig.color)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Badge variant="outline" className="text-xs">
              {rel.direction === 'outgoing' ? rel.relationshipType : rel.reverseLabel || rel.relationshipType}
            </Badge>
            {rel.entity.content && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {rel.entity.content}
              </p>
            )}
            <Link href={`/campaigns/${campaignId}/entities/${rel.entity.id}`}>
              <Button variant="ghost" size="sm" className="w-full mt-2">
                <ExternalLink className="h-3 w-3 mr-2" />
                View Details
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Characters Found</h3>
          <p className="text-muted-foreground">
            {isDM
              ? 'Create player characters and assign them to players to track relationships.'
              : 'You don\'t have a character assigned yet. Ask your DM to assign one.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Character Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Character:</label>
        <Select value={selectedCharacter} onValueChange={handleCharacterChange}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select a character" />
          </SelectTrigger>
          <SelectContent>
            {characters.map((char) => (
              <SelectItem key={char.id} value={char.id}>
                {char.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!loaded && selectedCharacter && (
          <Button onClick={() => loadRelationships(selectedCharacter)} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Load Relationships'
            )}
          </Button>
        )}
      </div>

      {loaded && stats && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:border-green-500"
              onClick={() => setActiveTab('friendly')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Friendly</p>
                    <p className="text-2xl font-bold text-green-500">{stats.friendly}</p>
                  </div>
                  <Heart className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:border-muted-foreground"
              onClick={() => setActiveTab('neutral')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Neutral</p>
                    <p className="text-2xl font-bold">{stats.neutral}</p>
                  </div>
                  <Minus className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:border-red-500"
              onClick={() => setActiveTab('hostile')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Hostile</p>
                    <p className="text-2xl font-bold text-red-500">{stats.hostile}</p>
                  </div>
                  <HeartCrack className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="npcs">NPCs Only</TabsTrigger>
              <TabsTrigger value="friendly">Friendly</TabsTrigger>
              <TabsTrigger value="hostile">Hostile</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              {/* Grouped view */}
              {Object.entries(groupedBySentiment).map(([sentiment, rels]) => {
                if (rels.length === 0) return null
                const config = SENTIMENT_CONFIG[sentiment as keyof typeof SENTIMENT_CONFIG]
                const Icon = config.icon

                return (
                  <div key={sentiment} className="mb-6">
                    <h3 className="text-lg font-medium flex items-center gap-2 mb-3">
                      <Icon className={cn('h-5 w-5', config.color)} />
                      {config.label} ({rels.length})
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {rels.map((rel) => (
                        <RelationshipCard key={rel.id} rel={rel} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </TabsContent>

            <TabsContent value="npcs" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredRelationships.map((rel) => (
                  <RelationshipCard key={rel.id} rel={rel} />
                ))}
              </div>
              {filteredRelationships.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No NPC relationships found
                </p>
              )}
            </TabsContent>

            <TabsContent value="friendly" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredRelationships.map((rel) => (
                  <RelationshipCard key={rel.id} rel={rel} />
                ))}
              </div>
              {filteredRelationships.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No friendly relationships yet. Make some friends!
                </p>
              )}
            </TabsContent>

            <TabsContent value="hostile" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredRelationships.map((rel) => (
                  <RelationshipCard key={rel.id} rel={rel} />
                ))}
              </div>
              {filteredRelationships.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No enemies... yet
                </p>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {!loaded && selectedCharacter && !loading && (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              Click "Load Relationships" to see who {characters.find((c) => c.id === selectedCharacter)?.name} knows
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
