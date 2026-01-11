'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { useToast } from '@/components/ui/use-toast'
import { Campaign, CampaignMember, Profile, MemberRole } from '@/lib/types'
import { ArrowLeft, Save, Trash2, UserPlus, X } from 'lucide-react'

interface MemberWithProfile extends CampaignMember {
  profile: Profile
}

export default function SettingsPage({
  params,
}: {
  params: { campaignId: string }
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('player')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', params.campaignId)
        .single()

      if (campaignData) {
        setCampaign(campaignData)
        setName(campaignData.name)
        setDescription(campaignData.description || '')
      }

      const { data: membersData } = await supabase
        .from('campaign_members')
        .select(`
          *,
          profile:profiles(*)
        `)
        .eq('campaign_id', params.campaignId)

      setMembers(membersData as MemberWithProfile[] || [])
      setLoading(false)
    }

    loadData()
  }, [params.campaignId, supabase])

  const handleSave = async () => {
    setSaving(true)

    const { error } = await supabase
      .from('campaigns')
      .update({ name, description })
      .eq('id', params.campaignId)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Success',
        description: 'Campaign updated successfully!',
      })
    }

    setSaving(false)
  }

  const handleInvite = async () => {
    setInviting(true)

    // Find user by username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', inviteUsername)
      .single()

    if (profileError || !profile) {
      toast({
        title: 'Error',
        description: 'User not found',
        variant: 'destructive',
      })
      setInviting(false)
      return
    }

    // Check if already a member
    const existingMember = members.find((m) => m.user_id === profile.id)
    if (existingMember) {
      toast({
        title: 'Error',
        description: 'User is already a member',
        variant: 'destructive',
      })
      setInviting(false)
      return
    }

    // Add member
    const { error } = await supabase.from('campaign_members').insert({
      campaign_id: params.campaignId,
      user_id: profile.id,
      role: inviteRole,
    })

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Success',
        description: 'Member added successfully!',
      })
      setInviteUsername('')
      // Reload members
      const { data: membersData } = await supabase
        .from('campaign_members')
        .select(`
          *,
          profile:profiles(*)
        `)
        .eq('campaign_id', params.campaignId)

      setMembers(membersData as MemberWithProfile[] || [])
    }

    setInviting(false)
  }

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase
      .from('campaign_members')
      .delete()
      .eq('id', memberId)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      setMembers(members.filter((m) => m.id !== memberId))
      toast({
        title: 'Success',
        description: 'Member removed',
      })
    }
  }

  const handleUpdateRole = async (memberId: string, role: MemberRole) => {
    const { error } = await supabase
      .from('campaign_members')
      .update({ role })
      .eq('id', memberId)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      setMembers(members.map((m) => (m.id === memberId ? { ...m, role } : m)))
      toast({
        title: 'Success',
        description: 'Role updated',
      })
    }
  }

  const handleDelete = async () => {
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', params.campaignId)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Success',
        description: 'Campaign deleted',
      })
      router.push('/campaigns')
    }
  }

  if (loading) {
    return (
      <div className="flex gap-6">
        <CampaignSidebar campaignId={params.campaignId} isDM={true} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={true} />

      <div className="flex-1 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Campaign Settings</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Update your campaign details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>Manage your campaign members</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Username to invite"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                />
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as MemberRole)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dm">DM</SelectItem>
                    <SelectItem value="player">Player</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleInvite} disabled={inviting || !inviteUsername}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite
                </Button>
              </div>

              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">
                          {member.profile?.display_name || member.profile?.username}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          @{member.profile?.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleUpdateRole(member.id, v as MemberRole)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dm">DM</SelectItem>
                          <SelectItem value="player">Player</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions for your campaign
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Are you sure?</DialogTitle>
                    <DialogDescription>
                      This will permanently delete the campaign &quot;{campaign?.name}&quot; and all
                      its notes. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleDelete}>
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
