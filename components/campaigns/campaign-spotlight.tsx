'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, RefreshCw, Loader2, AlertTriangle, Swords, Flame } from 'lucide-react'

interface SpotlightData {
  summary: string
  keyTension: string
  atStake: string
  featuredEntities: Array<{
    id: string
    name: string
    entityType: string
  }>
  lastUpdated: string
}

interface CampaignSpotlightProps {
  campaignId: string
}

export function CampaignSpotlight({ campaignId }: CampaignSpotlightProps) {
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSpotlight()
  }, [campaignId])

  const fetchSpotlight = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/spotlight`)
      if (res.ok) {
        const data = await res.json()
        setSpotlight(data)
        setError(null)
      } else {
        setError('Failed to load spotlight')
      }
    } catch (err) {
      setError('Failed to load spotlight')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/spotlight`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setSpotlight(data)
        setError(null)
      }
    } catch (err) {
      console.error('Failed to refresh spotlight:', err)
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <Card className="relative overflow-hidden border-[hsl(45_80%_45%)]/30 bg-gradient-to-br from-background via-background to-[hsl(45_80%_45%)]/5">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Consulting the Oracle...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !spotlight) {
    return (
      <Card className="relative overflow-hidden border-muted">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-5 w-5" />
            <span>Unable to divine the current situation</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden border-[hsl(45_80%_45%)]/30 bg-gradient-to-br from-background via-background to-[hsl(45_80%_45%)]/10">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-[hsl(45_80%_45%)]/20 to-transparent rounded-br-full" />
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-primary/10 to-transparent rounded-tl-full" />

      <CardContent className="relative py-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[hsl(45_80%_45%)]" />
              <h2
                className="text-lg font-semibold text-[hsl(45_80%_45%)]"
                style={{ fontFamily: 'Cinzel, serif' }}
              >
                The Story So Far
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Summary */}
          <p className="text-lg leading-relaxed italic text-foreground/90">
            "{spotlight.summary}"
          </p>

          {/* Key Tension & Stakes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <Swords className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-destructive uppercase tracking-wide mb-1">
                  Key Tension
                </p>
                <p className="text-sm">{spotlight.keyTension}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <Flame className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">
                  At Stake
                </p>
                <p className="text-sm">{spotlight.atStake}</p>
              </div>
            </div>
          </div>

          {/* Featured Entities */}
          {spotlight.featuredEntities.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {spotlight.featuredEntities.map((entity) => (
                <Link
                  key={entity.id}
                  href={`/campaigns/${campaignId}/entities/${entity.id}`}
                >
                  <Badge
                    variant="secondary"
                    className="hover:bg-secondary/80 cursor-pointer"
                  >
                    {entity.entityType === 'session' ? '📜' :
                     entity.entityType === 'quest' ? '⚔️' :
                     entity.entityType === 'npc' ? '👤' : '📖'}{' '}
                    {entity.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
