'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Copy, Check, Loader2, Trash2, ExternalLink, Shield, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Invite {
  id: string
  code: string
  role: 'player' | 'viewer'
  usesRemaining: number | null
  expiresAt: string | null
  createdAt: string
  url?: string
}

interface InviteModalProps {
  campaignId: string
  isOpen: boolean
  onClose: () => void
}

export function InviteModal({ campaignId, isOpen, onClose }: InviteModalProps) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Form state for creating new invite
  const [role, setRole] = useState<'player' | 'viewer'>('player')
  const [expiresIn, setExpiresIn] = useState<string>('never')
  const [usesLimit, setUsesLimit] = useState<string>('unlimited')

  // Load existing invites
  useEffect(() => {
    if (isOpen) {
      loadInvites()
    }
  }, [isOpen, campaignId])

  const loadInvites = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/invites`)
      const data = await response.json()
      setInvites(data.invites || [])
    } catch (error) {
      console.error('Failed to load invites:', error)
    } finally {
      setLoading(false)
    }
  }

  const createInvite = async () => {
    setCreating(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          expiresIn: expiresIn === 'never' ? null : expiresIn,
          usesLimit: usesLimit === 'unlimited' ? null : parseInt(usesLimit),
        }),
      })
      const data = await response.json()
      if (data.invite) {
        setInvites([data.invite, ...invites])
        // Copy the new invite to clipboard
        await copyToClipboard(data.invite.url || data.invite.code)
      }
    } catch (error) {
      console.error('Failed to create invite:', error)
    } finally {
      setCreating(false)
    }
  }

  const deleteInvite = async (code: string) => {
    try {
      await fetch(`/api/campaigns/${campaignId}/invites/${code}`, {
        method: 'DELETE',
      })
      setInvites(invites.filter((i) => i.code !== code))
    } catch (error) {
      console.error('Failed to delete invite:', error)
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  const getInviteUrl = (code: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/invite/${code}`
  }

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return 'Never'
    const date = new Date(expiresAt)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'Expired'
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays <= 7) return `${diffDays} days`
    return date.toLocaleDateString()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-card to-[hsl(35_30%_88%)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[hsl(45_80%_45%)]" />
            Invite to Party
          </DialogTitle>
          <DialogDescription>
            Create an invite link to share with players. They can join with just one click.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Create new invite section */}
          <div className="space-y-4 p-4 rounded-sm border-2 border-dashed border-border bg-muted/30">
            <h4 className="font-medium">Create New Invite</h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'player' | 'viewer')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Player
                      </span>
                    </SelectItem>
                    <SelectItem value="viewer">
                      <span className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Viewer
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expires</Label>
                <Select value={expiresIn} onValueChange={setExpiresIn}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never</SelectItem>
                    <SelectItem value="1d">1 Day</SelectItem>
                    <SelectItem value="7d">7 Days</SelectItem>
                    <SelectItem value="30d">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Uses</Label>
                <Select value={usesLimit} onValueChange={setUsesLimit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="1">1 use</SelectItem>
                    <SelectItem value="5">5 uses</SelectItem>
                    <SelectItem value="10">10 uses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={createInvite} disabled={creating} className="w-full">
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Generate Invite Link'
              )}
            </Button>
          </div>

          {/* Existing invites */}
          <div className="space-y-3">
            <h4 className="font-medium">Active Invites</h4>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : invites.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active invites. Create one above to share with players.
              </p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-2 p-3 rounded-sm border bg-background/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                          {invite.code}
                        </code>
                        <span
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded capitalize',
                            invite.role === 'player'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {invite.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>
                          Expires: {formatExpiry(invite.expiresAt)}
                        </span>
                        <span>
                          Uses: {invite.usesRemaining ?? '∞'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyToClipboard(getInviteUrl(invite.code))}
                      >
                        {copied === getInviteUrl(invite.code) ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(getInviteUrl(invite.code), '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteInvite(invite.code)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
