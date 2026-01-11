'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'

const ENTITY_TYPES = [
  { value: 'npc', label: 'NPC' },
  { value: 'location', label: 'Location' },
  { value: 'item', label: 'Item' },
  { value: 'quest', label: 'Quest' },
  { value: 'faction', label: 'Faction' },
  { value: 'lore', label: 'Lore' },
  { value: 'session', label: 'Session' },
  { value: 'player_character', label: 'Player Character' },
  { value: 'freeform', label: 'Freeform' },
]

interface Entity {
  id: string
  name: string
  entityType: string
  content: string
  aliases: string[]
  tags: string[]
  isDmOnly: boolean
}

export default function EditEntityPage({
  params,
}: {
  params: { campaignId: string; entityId: string }
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState('')
  const [content, setContent] = useState('')
  const [aliases, setAliases] = useState('')
  const [tags, setTags] = useState('')
  const [isDmOnly, setIsDmOnly] = useState(false)

  useEffect(() => {
    async function loadEntity() {
      try {
        const res = await fetch(
          `/api/campaigns/${params.campaignId}/entities/${params.entityId}`
        )
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load entity')
        }

        const e = data.entity
        setEntity(e)
        setName(e.name)
        setEntityType(e.entityType)
        setContent(e.content || '')
        setAliases(e.aliases?.join(', ') || '')
        setTags(e.tags?.join(', ') || '')
        setIsDmOnly(e.isDmOnly || false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    loadEntity()
  }, [params.campaignId, params.entityId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch(
        `/api/campaigns/${params.campaignId}/entities/${params.entityId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            content,
            aliases: aliases
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
            tags: tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            isDmOnly,
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      router.push(`/campaigns/${params.campaignId}/entities/${params.entityId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!entity) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{error || 'Entity not found'}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href={`/campaigns/${params.campaignId}/entities/${params.entityId}`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to entity
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit {entity.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content (Markdown)</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={15}
                className="font-mono text-sm"
                placeholder="Use [[Entity Name]] for wiki links..."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="aliases">Aliases (comma-separated)</Label>
                <Input
                  id="aliases"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="Other names, nicknames..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="villain, merchant, quest-giver..."
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isDmOnly"
                checked={isDmOnly}
                onChange={(e) => setIsDmOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isDmOnly">DM Only (hidden from players)</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Link href={`/campaigns/${params.campaignId}/entities/${params.entityId}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
