'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, UserPlus, UserMinus, ChevronDown, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  userId: string
  role: string
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
}

interface ClaimCharacterButtonProps {
  entityId: string
  campaignId: string
  currentPlayerId: string | null
  currentPlayerName: string | null
  currentUserId: string
  currentUserMemberId: string | null
  isDM: boolean
}

export function ClaimCharacterButton({
  entityId,
  campaignId,
  currentPlayerId,
  currentPlayerName,
  currentUserId,
  currentUserMemberId,
  isDM,
}: ClaimCharacterButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  const isClaimedByMe = currentPlayerId === currentUserMemberId
  const isClaimed = !!currentPlayerId

  // Load members for DM dropdown
  useEffect(() => {
    if (isDM) {
      setLoadingMembers(true)
      fetch(`/api/campaigns/${campaignId}/members`)
        .then((res) => res.json())
        .then((data) => {
          // Filter to players only (not DMs or viewers)
          const players = data.members?.filter(
            (m: Member) => m.role === 'player'
          ) || []
          setMembers(players)
        })
        .catch(console.error)
        .finally(() => setLoadingMembers(false))
    }
  }, [campaignId, isDM])

  const handleClaim = async (memberId?: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/entities/${entityId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberId ? { memberId } : {}),
      })

      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to claim character')
      }
    } catch (error) {
      alert('Failed to claim character')
    } finally {
      setLoading(false)
    }
  }

  const handleUnclaim = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/entities/${entityId}/claim`, {
        method: 'DELETE',
      })

      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to unclaim character')
      }
    } catch (error) {
      alert('Failed to unclaim character')
    } finally {
      setLoading(false)
    }
  }

  // DM view - dropdown with all players
  if (isDM) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading || loadingMembers}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <User className="h-4 w-4 mr-2" />
            )}
            {isClaimed ? currentPlayerName || 'Assigned' : 'Unassigned'}
            <ChevronDown className="h-3 w-3 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {members.length === 0 ? (
            <DropdownMenuItem disabled>
              No players in campaign
            </DropdownMenuItem>
          ) : (
            members.map((member) => (
              <DropdownMenuItem
                key={member.id}
                onClick={() => handleClaim(member.id)}
                className={currentPlayerId === member.id ? 'bg-accent' : ''}
              >
                <User className="h-4 w-4 mr-2" />
                {member.user.name || member.user.email}
                {currentPlayerId === member.id && ' (current)'}
              </DropdownMenuItem>
            ))
          )}
          {isClaimed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleUnclaim} className="text-destructive">
                <UserMinus className="h-4 w-4 mr-2" />
                Remove assignment
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Player view - simple claim/unclaim button
  if (isClaimedByMe) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleUnclaim}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <UserMinus className="h-4 w-4 mr-2" />
        )}
        Unclaim Character
      </Button>
    )
  }

  if (!isClaimed) {
    return (
      <Button
        variant="default"
        size="sm"
        onClick={() => handleClaim()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <UserPlus className="h-4 w-4 mr-2" />
        )}
        Claim Character
      </Button>
    )
  }

  // Character is claimed by someone else - show who
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <User className="h-4 w-4" />
      <span>Played by {currentPlayerName}</span>
    </div>
  )
}
