'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Save, Trash2 } from 'lucide-react'

interface Campaign {
  id: string
  name: string
  description: string | null
}

export default function SettingsPage({
  params,
}: {
  params: { campaignId: string }
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const loadData = async () => {
      const res = await fetch(`/api/campaigns/${params.campaignId}`)
      if (res.ok) {
        const data = await res.json()
        setCampaign(data)
        setName(data.name)
        setDescription(data.description || '')
      }
      setLoading(false)
    }

    loadData()
  }, [params.campaignId])

  const handleSave = async () => {
    setSaving(true)

    const res = await fetch(`/api/campaigns/${params.campaignId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })

    if (!res.ok) {
      const data = await res.json()
      toast({
        title: 'Error',
        description: data.error || 'Failed to update campaign',
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

  const handleDelete = async () => {
    const res = await fetch(`/api/campaigns/${params.campaignId}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const data = await res.json()
      toast({
        title: 'Error',
        description: data.error || 'Failed to delete campaign',
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
