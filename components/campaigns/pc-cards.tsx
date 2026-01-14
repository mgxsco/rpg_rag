'use client'

import { memo, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Users, Sword, Shield, Loader2, ChevronRight } from 'lucide-react'

interface PlayerCharacter {
  id: string
  name: string
  content: string | null
  aliases: string[] | null
  updatedAt: string
}

interface PCCardsProps {
  campaignId: string
}

// Utility functions moved outside component to avoid recreation
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const AVATAR_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
]

function getAvatarColor(name: string): string {
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

function getBriefDescription(content: string | null): string | null {
  if (!content) return null
  const firstLine = content.split('\n')[0].trim()
  const firstSentence = firstLine.split('.')[0].trim()
  return firstSentence.length > 80 ? firstSentence.slice(0, 80) + '...' : firstSentence
}

// Memoized character card component
const CharacterCard = memo(function CharacterCard({
  character,
  campaignId,
}: {
  character: PlayerCharacter
  campaignId: string
}) {
  return (
    <Link
      href={`/campaigns/${campaignId}/entities/${character.id}`}
      className="group"
    >
      <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
        <Avatar className={`h-10 w-10 ${getAvatarColor(character.name)}`}>
          <AvatarFallback className="text-white font-semibold text-sm">
            {getInitials(character.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate group-hover:text-primary transition-colors">
              {character.name}
            </p>
            <Shield className="h-3.5 w-3.5 text-[hsl(45_80%_45%)] shrink-0" />
          </div>
          {getBriefDescription(character.content) && (
            <p className="text-xs text-muted-foreground truncate">
              {getBriefDescription(character.content)}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
    </Link>
  )
})

export function PCCards({ campaignId }: PCCardsProps) {
  const [characters, setCharacters] = useState<PlayerCharacter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCharacters()
  }, [campaignId])

  const fetchCharacters = async () => {
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/entities?type=player_character&limit=10`
      )
      if (res.ok) {
        const data = await res.json()
        setCharacters(data.entities || [])
      }
    } catch (err) {
      console.error('Failed to fetch characters:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            The Party
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

  if (characters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            The Party
          </CardTitle>
          <CardDescription>Player characters in your campaign</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Sword className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No player characters yet</p>
            <p className="text-xs mt-1">Add characters to see them here</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-[hsl(45_80%_45%)]" />
          The Party
        </CardTitle>
        <CardDescription>{characters.length} adventurer{characters.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              campaignId={campaignId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
