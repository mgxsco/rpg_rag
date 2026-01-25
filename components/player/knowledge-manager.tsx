'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Brain, Plus, Trash2, Loader2, Search, Users, BookOpen } from 'lucide-react'
import { Entity } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

interface KnowledgeManagerProps {
  campaignId: string
  characters: Entity[]
  sessions: Entity[]
  allEntities: Entity[]
}

export function KnowledgeManager({
  campaignId,
  characters,
  sessions,
  allEntities,
}: KnowledgeManagerProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<string>(characters[0]?.id || '')
  const [selectedSession, setSelectedSession] = useState<string>('')
  const [knownEntityIds, setKnownEntityIds] = useState<Set<string>>(new Set())
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  // Load character's current knowledge
  useEffect(() => {
    if (!selectedCharacter) return

    const loadKnowledge = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/knowledge?characterId=${selectedCharacter}`
        )
        if (res.ok) {
          const data = await res.json()
          setKnownEntityIds(new Set(data.knownEntityIds))
        }
      } catch (error) {
        console.error('Failed to load knowledge:', error)
      } finally {
        setLoading(false)
      }
    }

    loadKnowledge()
  }, [campaignId, selectedCharacter])

  const handleAddKnowledge = async () => {
    if (selectedEntityIds.size === 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: selectedCharacter,
          entityIds: Array.from(selectedEntityIds),
          sessionId: selectedSession && selectedSession !== 'none' ? selectedSession : undefined,
        }),
      })

      if (res.ok) {
        // Update local state
        setKnownEntityIds((prev) => new Set([...prev, ...selectedEntityIds]))
        setSelectedEntityIds(new Set())
        setIsAddDialogOpen(false)
      }
    } catch (error) {
      console.error('Failed to add knowledge:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveKnowledge = async (entityId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/knowledge`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: selectedCharacter,
          entityIds: [entityId],
        }),
      })

      if (res.ok) {
        setKnownEntityIds((prev) => {
          const newSet = new Set(prev)
          newSet.delete(entityId)
          return newSet
        })
      }
    } catch (error) {
      console.error('Failed to remove knowledge:', error)
    } finally {
      setSaving(false)
    }
  }

  const toggleEntitySelection = (entityId: string) => {
    setSelectedEntityIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(entityId)) {
        newSet.delete(entityId)
      } else {
        newSet.add(entityId)
      }
      return newSet
    })
  }

  // Filter entities for the add dialog
  const filteredEntities = allEntities.filter((e) => {
    // Exclude already known entities
    if (knownEntityIds.has(e.id)) return false
    // Exclude player characters and sessions
    if (['player_character', 'session', 'journal_entry'].includes(e.entityType)) return false
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return e.name.toLowerCase().includes(query)
    }
    return true
  })

  // Get known entities with details
  const knownEntities = allEntities.filter((e) => knownEntityIds.has(e.id))

  // Group by type for display
  const knownByType: Record<string, Entity[]> = {}
  for (const entity of knownEntities) {
    if (!knownByType[entity.entityType]) {
      knownByType[entity.entityType] = []
    }
    knownByType[entity.entityType].push(entity)
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Player Characters</h3>
          <p className="text-muted-foreground">
            Create player characters and assign them to players to manage their knowledge.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Character and Session Selectors */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-2 block">Character</label>
          <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
            <SelectTrigger>
              <SelectValue placeholder="Select a character" />
            </SelectTrigger>
            <SelectContent>
              {characters.map((char) => (
                <SelectItem key={char.id} value={char.id}>
                  {char.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-2 block">Session (optional)</label>
          <Select value={selectedSession} onValueChange={setSelectedSession}>
            <SelectTrigger>
              <SelectValue placeholder="When did they learn?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No specific session</SelectItem>
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  Session {session.sessionNumber}: {session.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <Badge variant="outline" className="text-base py-1 px-3">
          <Brain className="h-4 w-4 mr-2" />
          {knownEntityIds.size} known entities
        </Badge>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Knowledge
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Add Knowledge</DialogTitle>
              <DialogDescription>
                Select entities that{' '}
                {characters.find((c) => c.id === selectedCharacter)?.name || 'the character'} has
                learned about.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search entities..."
                  className="pl-9"
                />
              </div>

              {/* Entity List */}
              <ScrollArea className="h-[400px] border rounded-lg p-2">
                {filteredEntities.length > 0 ? (
                  <div className="space-y-1">
                    {filteredEntities.map((entity) => (
                      <div
                        key={entity.id}
                        className={cn(
                          'flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted',
                          selectedEntityIds.has(entity.id) && 'bg-primary/10'
                        )}
                        onClick={() => toggleEntitySelection(entity.id)}
                      >
                        <Checkbox
                          checked={selectedEntityIds.has(entity.id)}
                          onCheckedChange={() => toggleEntitySelection(entity.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{entity.name}</p>
                          <p className="text-sm text-muted-foreground">{entity.entityType}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {searchQuery ? 'No matching entities' : 'All entities are already known'}
                  </p>
                )}
              </ScrollArea>

              {selectedEntityIds.size > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedEntityIds.size} entities selected
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddKnowledge}
                disabled={saving || selectedEntityIds.size === 0}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add {selectedEntityIds.size} Entities
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Known Entities by Type */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : Object.keys(knownByType).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(knownByType)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([type, typeEntities]) => (
              <div key={type}>
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  {type.replace(/_/g, ' ')}
                  <Badge variant="secondary">{typeEntities.length}</Badge>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {typeEntities.map((entity) => (
                    <Card key={entity.id} className="group">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{entity.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive"
                            onClick={() => handleRemoveKnowledge(entity.id)}
                            disabled={saving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Knowledge Yet</h3>
            <p className="text-muted-foreground mb-4">
              This character doesn't know about any entities yet. Add knowledge to track what they've learned.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Knowledge
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
