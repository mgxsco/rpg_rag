'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Loader2, BookOpen, User } from 'lucide-react'

const DEFAULT_ENTITY_TYPES = [
  { value: 'npc', label: 'NPC' },
  { value: 'player_character', label: 'Player Character' },
  { value: 'location', label: 'Location' },
  { value: 'item', label: 'Item' },
  { value: 'quest', label: 'Quest' },
  { value: 'faction', label: 'Faction' },
  { value: 'lore', label: 'Lore' },
  { value: 'creature', label: 'Creature' },
  { value: 'event', label: 'Event' },
  { value: 'freeform', label: 'Freeform' },
]

export default function NewEntityPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params.campaignId as string

  const [isLoading, setIsLoading] = useState(false)
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
  const [entityType, setEntityType] = useState('npc')
  const [content, setContent] = useState('')
  const [aliases, setAliases] = useState('')
  const [tags, setTags] = useState('')
  const [isDmOnly, setIsDmOnly] = useState(false)
  const [playerId, setPlayerId] = useState('')

  // Load existing entity types and members from campaign
  useEffect(() => {
    async function loadData() {
      try {
        // Load entity types and members in parallel
        const [entitiesRes, membersRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}/entities`),
          fetch(`/api/campaigns/${campaignId}/members`),
        ])

        if (entitiesRes.ok) {
          const data = await entitiesRes.json()
          const types = [...new Set(data.entities.map((e: any) => e.entityType))] as string[]
          setCampaignEntityTypes(types)
        }

        if (membersRes.ok) {
          const data = await membersRes.json()
          setMembers(data.members.filter((m: any) => m.role === 'player'))
        }
      } catch (err) {
        console.error('Failed to load data:', err)
      }
    }
    loadData()
  }, [campaignId])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Please enter a name')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          entityType,
          content: content.trim(),
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
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create entity')
      }

      const newEntity = await response.json()
      router.push(`/campaigns/${campaignId}/entities/${newEntity.id}`)
    } catch (err) {
      console.error('Error creating entity:', err)
      setError(err instanceof Error ? err.message : 'Failed to create entity')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href={`/campaigns/${campaignId}/entities`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to wiki
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            New Wiki Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {/* Name and Type */}
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Gandalf the Grey"
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

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Describe this entry... Use [[Entity Name]] to link to other wiki entries."
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Supports Markdown. Use [[Entity Name]] to link to wiki entries.
              </p>
            </div>

            {/* Aliases and Tags */}
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
                  placeholder="wizard, mentor, ally..."
                />
              </div>
            </div>

            {/* DM Only */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isDmOnly"
                checked={isDmOnly}
                onCheckedChange={(checked) => setIsDmOnly(checked as boolean)}
              />
              <Label htmlFor="isDmOnly" className="font-normal">
                DM Only (hidden from players)
              </Label>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Entry'
                )}
              </Button>
              <Link href={`/campaigns/${campaignId}/entities`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
