'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, Loader2, Plus, User } from 'lucide-react'

const DEFAULT_ENTITY_TYPES = [
  { value: 'npc', label: 'NPC' },
  { value: 'location', label: 'Location' },
  { value: 'item', label: 'Item' },
  { value: 'quest', label: 'Quest' },
  { value: 'faction', label: 'Faction' },
  { value: 'lore', label: 'Lore' },
  { value: 'session', label: 'Session' },
  { value: 'player_character', label: 'Player Character' },
  { value: 'creature', label: 'Creature' },
  { value: 'event', label: 'Event' },
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
  const [campaignEntityTypes, setCampaignEntityTypes] = useState<string[]>([])
  const [showCustomType, setShowCustomType] = useState(false)
  const [customType, setCustomType] = useState('')
  const [members, setMembers] = useState<Array<{
    id: string
    userId: string
    role: string
    user: { id: string; name: string | null; email: string }
  }>>([])

  // Form state
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState('')
  const [content, setContent] = useState('')
  const [aliases, setAliases] = useState('')
  const [tags, setTags] = useState('')
  const [isDmOnly, setIsDmOnly] = useState(false)
  const [playerId, setPlayerId] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        // Load entity, campaign entities, and members in parallel
        const [entityRes, entitiesRes, membersRes] = await Promise.all([
          fetch(`/api/campaigns/${params.campaignId}/entities/${params.entityId}`),
          fetch(`/api/campaigns/${params.campaignId}/entities`),
          fetch(`/api/campaigns/${params.campaignId}/members`),
        ])

        if (entityRes.ok) {
          const data = await entityRes.json()
          const e = data.entity
          setEntity(e)
          setName(e.name)
          setEntityType(e.entityType)
          setContent(e.content || '')
          setAliases(e.aliases?.join(', ') || '')
          setTags(e.tags?.join(', ') || '')
          setIsDmOnly(e.isDmOnly || false)
          setPlayerId(e.playerId || '')
        } else {
          const data = await entityRes.json()
          throw new Error(data.error || 'Failed to load entity')
        }

        // Extract unique entity types from campaign
        if (entitiesRes.ok) {
          const data = await entitiesRes.json()
          const types = [...new Set(data.entities.map((e: any) => e.entityType))] as string[]
          setCampaignEntityTypes(types)
        }

        // Load members
        if (membersRes.ok) {
          const data = await membersRes.json()
          setMembers(data.members.filter((m: any) => m.role === 'player'))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [params.campaignId, params.entityId])

  // Merge default types with campaign-specific types
  const allTypes = [...DEFAULT_ENTITY_TYPES]
  campaignEntityTypes.forEach((type) => {
    if (!allTypes.find((t) => t.value === type)) {
      allTypes.push({
        value: type,
        label: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      })
    }
  })

  const handleTypeChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomType(true)
      setCustomType('')
    } else {
      setShowCustomType(false)
      setEntityType(value)
    }
  }

  const handleCustomTypeConfirm = () => {
    if (customType.trim()) {
      const normalized = customType.trim().toLowerCase().replace(/\s+/g, '_')
      setEntityType(normalized)
      setShowCustomType(false)
    }
  }

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
            entityType,
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
            playerId: entityType === 'player_character' && playerId ? playerId : null,
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
    <div className="max-w-4xl mx-auto">
      <Link
        href={`/campaigns/${params.campaignId}/entities/${params.entityId}`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to entity
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit {entity.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
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
                {showCustomType ? (
                  <div className="flex gap-2">
                    <Input
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      placeholder="Enter custom type..."
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCustomTypeConfirm}
                      disabled={!customType.trim()}
                    >
                      OK
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCustomType(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <select
                    value={entityType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {allTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                    <option value="__custom__">+ Add custom type...</option>
                  </select>
                )}
              </div>
            </div>

            {/* Player Selection (only for player_character type) */}
            {entityType === 'player_character' && members.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="player" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Controlled by Player
                </Label>
                <select
                  id="player"
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">-- No player assigned --</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.user.name || member.user.email}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Link this character to a campaign member
                </p>
              </div>
            )}

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

            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
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
