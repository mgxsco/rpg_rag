'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Crown, Shield, Eye, UserPlus, MoreVertical, UserMinus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PartyMember {
  id: string
  userId: string
  userName: string | null
  userImage?: string | null
  role: 'dm' | 'player' | 'viewer'
  joinedAt?: Date
}

interface PartyPanelProps {
  campaignId: string
  members: PartyMember[]
  ownerId: string
  currentUserId: string
  isDM: boolean
  onInvite: () => void
  onRoleChange?: (userId: string, newRole: 'dm' | 'player' | 'viewer') => Promise<void>
  onRemoveMember?: (userId: string) => Promise<void>
  onLeave?: () => Promise<void>
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getRoleIcon(role: 'dm' | 'player' | 'viewer') {
  switch (role) {
    case 'dm':
      return <Crown className="h-3 w-3 text-[hsl(45_80%_45%)]" />
    case 'player':
      return <Shield className="h-3 w-3 text-primary" />
    case 'viewer':
      return <Eye className="h-3 w-3 text-muted-foreground" />
  }
}

function getRoleLabel(role: 'dm' | 'player' | 'viewer') {
  switch (role) {
    case 'dm':
      return 'Dungeon Master'
    case 'player':
      return 'Player'
    case 'viewer':
      return 'Viewer'
  }
}

function MemberCard({
  member,
  isOwner,
  isCurrentUser,
  isDM,
  onRoleChange,
  onRemove,
}: {
  member: PartyMember
  isOwner: boolean
  isCurrentUser: boolean
  isDM: boolean
  onRoleChange?: (newRole: 'dm' | 'player' | 'viewer') => Promise<void>
  onRemove?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  const handleRoleChange = async (role: 'dm' | 'player' | 'viewer') => {
    if (!onRoleChange) return
    setLoading(true)
    try {
      await onRoleChange(role)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async () => {
    if (!onRemove) return
    setLoading(true)
    try {
      await onRemove()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center p-3 rounded-sm border-2 bg-gradient-to-b from-card to-[hsl(35_25%_88%)] min-w-[90px] shrink-0',
        isOwner && 'border-[hsl(45_80%_45%)] shadow-md',
        !isOwner && 'border-border'
      )}
    >
      {/* Decorative corners for owner */}
      {isOwner && (
        <>
          <div className="absolute top-0.5 left-0.5 w-2 h-2 border-t border-l border-[hsl(45_80%_45%)]" />
          <div className="absolute top-0.5 right-0.5 w-2 h-2 border-t border-r border-[hsl(45_80%_45%)]" />
          <div className="absolute bottom-0.5 left-0.5 w-2 h-2 border-b border-l border-[hsl(45_80%_45%)]" />
          <div className="absolute bottom-0.5 right-0.5 w-2 h-2 border-b border-r border-[hsl(45_80%_45%)]" />
        </>
      )}

      {/* Avatar */}
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold',
          isOwner
            ? 'bg-gradient-to-br from-[hsl(45_80%_45%)] to-[hsl(25_70%_35%)] text-white'
            : 'bg-gradient-to-br from-primary to-[hsl(25_70%_30%)] text-primary-foreground'
        )}
      >
        {member.userImage ? (
          <img
            src={member.userImage}
            alt={member.userName || 'Member'}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          getInitials(member.userName)
        )}
      </div>

      {/* Role badge */}
      <div className="flex items-center gap-1 mt-2">
        {getRoleIcon(member.role)}
        <span className="text-xs text-muted-foreground capitalize">
          {member.role === 'dm' ? 'DM' : member.role}
        </span>
      </div>

      {/* Name */}
      <p className="text-sm font-medium text-center mt-1 truncate max-w-[80px]">
        {member.userName || 'Unknown'}
      </p>

      {/* DM actions dropdown */}
      {isDM && !isOwner && !isCurrentUser && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <MoreVertical className="h-3 w-3" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleRoleChange('dm')}>
              <Crown className="h-4 w-4 mr-2" />
              Make DM
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleRoleChange('player')}>
              <Shield className="h-4 w-4 mr-2" />
              Make Player
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleRoleChange('viewer')}>
              <Eye className="h-4 w-4 mr-2" />
              Make Viewer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-destructive focus:text-destructive"
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Remove from Party
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Current user indicator */}
      {isCurrentUser && (
        <span className="absolute -top-1 -right-1 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm">
          You
        </span>
      )}
    </div>
  )
}

export function PartyPanel({
  campaignId,
  members,
  ownerId,
  currentUserId,
  isDM,
  onInvite,
  onRoleChange,
  onRemoveMember,
  onLeave,
}: PartyPanelProps) {
  // Sort members: owner first, then DMs, then players, then viewers
  const sortedMembers = [...members].sort((a, b) => {
    if (a.userId === ownerId) return -1
    if (b.userId === ownerId) return 1
    const roleOrder = { dm: 0, player: 1, viewer: 2 }
    return roleOrder[a.role] - roleOrder[b.role]
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            The Adventuring Party
          </CardTitle>
          {isDM && (
            <Button variant="outline" size="sm" onClick={onInvite}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex overflow-x-auto md:flex-wrap gap-3 pb-2 -mx-2 px-2 scrollbar-hide scroll-touch">
          {sortedMembers.map((member) => (
            <MemberCard
              key={member.userId}
              member={member}
              isOwner={member.userId === ownerId}
              isCurrentUser={member.userId === currentUserId}
              isDM={isDM}
              onRoleChange={
                onRoleChange
                  ? (role) => onRoleChange(member.userId, role)
                  : undefined
              }
              onRemove={
                onRemoveMember ? () => onRemoveMember(member.userId) : undefined
              }
            />
          ))}

          {/* Invite placeholder card */}
          {isDM && (
            <button
              onClick={onInvite}
              className="flex flex-col items-center justify-center p-3 rounded-sm border-2 border-dashed border-border bg-muted/30 min-w-[90px] min-h-[100px] hover:border-primary/50 hover:bg-muted/50 transition-colors"
            >
              <UserPlus className="h-8 w-8 text-muted-foreground" />
              <span className="text-xs text-muted-foreground mt-2">
                Add Member
              </span>
            </button>
          )}
        </div>

        {/* Leave campaign button for non-owners */}
        {!isDM && currentUserId !== ownerId && onLeave && (
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onLeave}
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Leave Campaign
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
