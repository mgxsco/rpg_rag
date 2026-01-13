'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Loader2, CalendarDays } from 'lucide-react'

export default function NewSessionPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params.campaignId as string

  const [isLoading, setIsLoading] = useState(false)
  const [nextSessionNumber, setNextSessionNumber] = useState(1)

  // Form state
  const [name, setName] = useState('')
  const [sessionNumber, setSessionNumber] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [inGameDate, setInGameDate] = useState('')
  const [sessionStatus, setSessionStatus] = useState('planned')
  const [content, setContent] = useState('')
  const [isDmOnly, setIsDmOnly] = useState(false)

  // Fetch next session number
  useEffect(() => {
    async function fetchNextNumber() {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/sessions`)
        if (response.ok) {
          const data = await response.json()
          const maxNumber = data.sessions.reduce(
            (max: number, s: any) => Math.max(max, s.sessionNumber || 0),
            0
          )
          setNextSessionNumber(maxNumber + 1)
          setSessionNumber(String(maxNumber + 1))
        }
      } catch (error) {
        console.error('Error fetching sessions:', error)
      }
    }
    fetchNextNumber()
  }, [campaignId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      alert('Please enter a session name')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sessionNumber: sessionNumber ? parseInt(sessionNumber) : null,
          sessionDate: sessionDate || null,
          inGameDate: inGameDate.trim() || null,
          sessionStatus,
          content: content.trim(),
          isDmOnly,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create session')
      }

      const newSession = await response.json()
      router.push(`/campaigns/${campaignId}/entities/${newSession.id}`)
    } catch (error) {
      console.error('Error creating session:', error)
      alert(error instanceof Error ? error.message : 'Failed to create session')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/campaigns/${campaignId}/sessions`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to sessions
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            New Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Session Number and Name */}
            <div className="grid grid-cols-[100px_1fr] gap-4">
              <div className="space-y-2">
                <Label htmlFor="sessionNumber">Session #</Label>
                <Input
                  id="sessionNumber"
                  type="number"
                  min="1"
                  value={sessionNumber}
                  onChange={(e) => setSessionNumber(e.target.value)}
                  placeholder={String(nextSessionNumber)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Title *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., The Caves of Chaos"
                  required
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sessionDate">Date Played</Label>
                <Input
                  id="sessionDate"
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inGameDate">In-Game Date</Label>
                <Input
                  id="inGameDate"
                  value={inGameDate}
                  onChange={(e) => setInGameDate(e.target.value)}
                  placeholder="e.g., 3rd of Leaffall, Year 1042"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={sessionStatus} onValueChange={setSessionStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="content">Recap / Notes</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What happened this session? Use [[Entity Name]] to link to wiki entries..."
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                Supports Markdown. Use [[Entity Name]] to link to wiki entries.
              </p>
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
                  'Create Session'
                )}
              </Button>
              <Link href={`/campaigns/${campaignId}/sessions`}>
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
