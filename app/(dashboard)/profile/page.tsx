'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { Checkbox } from '@/components/ui/checkbox'
import { User, Lock, Camera, Loader2, Save, Calendar, Mail, Users, Swords } from 'lucide-react'

interface CampaignCharacter {
  id: string
  name: string
  playerId: string | null
  isMine: boolean
  assignedTo: {
    id: string
    name: string | null
    email: string
  } | null
}

interface CampaignWithCharacters {
  id: string
  name: string
  membershipId: string | null
  characters: CampaignCharacter[]
}

interface UserProfile {
  id: string
  name: string | null
  email: string
  image: string | null
  createdAt: string
}

export default function ProfilePage() {
  const router = useRouter()
  const { toast } = useToast()

  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Profile form
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Characters
  const [campaigns, setCampaigns] = useState<CampaignWithCharacters[]>([])
  const [loadingCharacters, setLoadingCharacters] = useState(false)
  const [savingCharacters, setSavingCharacters] = useState<string | null>(null)

  useEffect(() => {
    loadProfile()
    loadCharacters()
  }, [])

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/user')
      if (res.ok) {
        const data = await res.json()
        setUser(data)
        setName(data.name || '')
        setImageUrl(data.image || '')
      } else if (res.status === 401) {
        router.push('/login')
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCharacters = async () => {
    setLoadingCharacters(true)
    try {
      const res = await fetch('/api/user/characters')
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error('Failed to load characters:', error)
    } finally {
      setLoadingCharacters(false)
    }
  }

  const handleToggleCharacter = async (campaignId: string, characterId: string, isCurrentlyMine: boolean) => {
    // Find the campaign and update local state optimistically
    const campaignIndex = campaigns.findIndex((c) => c.id === campaignId)
    if (campaignIndex === -1) return

    const campaign = campaigns[campaignIndex]
    const myCharacterIds = campaign.characters
      .filter((c) => c.isMine)
      .map((c) => c.id)

    let newCharacterIds: string[]
    if (isCurrentlyMine) {
      // Remove from my characters
      newCharacterIds = myCharacterIds.filter((id) => id !== characterId)
    } else {
      // Add to my characters
      newCharacterIds = [...myCharacterIds, characterId]
    }

    // Update local state optimistically
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              characters: c.characters.map((char) =>
                char.id === characterId
                  ? { ...char, isMine: !isCurrentlyMine }
                  : char
              ),
            }
          : c
      )
    )

    setSavingCharacters(campaignId)
    try {
      const res = await fetch('/api/user/characters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          characterIds: newCharacterIds,
        }),
      })

      if (!res.ok) {
        // Revert on failure
        loadCharacters()
        const error = await res.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to update character',
          variant: 'destructive',
        })
      }
    } catch (error) {
      loadCharacters()
      toast({
        title: 'Error',
        description: 'Failed to update character',
        variant: 'destructive',
      })
    } finally {
      setSavingCharacters(null)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || null,
          image: imageUrl || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setUser(data)
        toast({
          title: 'Profile updated',
          description: 'Your profile has been saved.',
        })
      } else {
        const error = await res.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to update profile',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'New passwords do not match',
        variant: 'destructive',
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (res.ok) {
        toast({
          title: 'Password changed',
          description: 'Your password has been updated.',
        })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const error = await res.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to change password',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to change password',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return email.slice(0, 2).toUpperCase()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load profile</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="text-lg">
                {getInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold">{user.name || 'No name set'}</h2>
              <p className="text-muted-foreground flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {user.email}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3" />
                Member since {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="characters" className="flex items-center gap-2">
            <Swords className="h-4 w-4" />
            Characters
          </TabsTrigger>
          <TabsTrigger value="password" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Avatar URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="image"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  {imageUrl && (
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={imageUrl} />
                      <AvatarFallback>
                        <Camera className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter a URL to an image for your avatar
                </p>
              </div>

              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="characters">
          <Card>
            <CardHeader>
              <CardTitle>My Characters</CardTitle>
              <CardDescription>
                Select the player characters you play in each campaign
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCharacters ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>You are not a member of any campaigns yet</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="space-y-3">
                      <h3 className="font-medium flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        {campaign.name}
                      </h3>
                      {campaign.characters.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">
                          No player characters in this campaign
                        </p>
                      ) : (
                        <div className="space-y-2 pl-6">
                          {campaign.characters.map((character) => {
                            const isAssignedToOther = character.assignedTo && !character.isMine
                            return (
                              <label
                                key={character.id}
                                className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                                  character.isMine
                                    ? 'border-primary/50 bg-primary/5'
                                    : isAssignedToOther
                                    ? 'border-muted bg-muted/30 opacity-60'
                                    : 'border-border hover:border-primary/30 hover:bg-muted/50'
                                }`}
                              >
                                <Checkbox
                                  checked={character.isMine}
                                  disabled={isAssignedToOther || savingCharacters === campaign.id}
                                  onCheckedChange={() =>
                                    handleToggleCharacter(campaign.id, character.id, character.isMine)
                                  }
                                />
                                <Swords className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{character.name}</span>
                                {isAssignedToOther && (
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    Played by {character.assignedTo?.name || character.assignedTo?.email}
                                  </span>
                                )}
                                {savingCharacters === campaign.id && (
                                  <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                                )}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={saving || !currentPassword || !newPassword || !confirmPassword}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                Change Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
