'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageSquare, Send, Loader2, Trash2 } from 'lucide-react'

interface Comment {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string | null
    image: string | null
  }
}

interface EntityCommentsProps {
  entityId: string
  currentUserId?: string
  isDM?: boolean
}

export function EntityComments({ entityId, currentUserId, isDM }: EntityCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await fetch(`/api/entities/${entityId}/comments`)
        if (res.ok) {
          const data = await res.json()
          setComments(data.comments)
          setError(null)
        } else {
          setError('Failed to load comments')
        }
      } catch (err) {
        setError('Failed to load comments')
      } finally {
        setLoading(false)
      }
    }

    fetchComments()
  }, [entityId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || sending) return

    setSending(true)
    setError(null)

    try {
      const res = await fetch(`/api/entities/${entityId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })

      if (res.ok) {
        const newComment = await res.json()
        setComments((prev) => [newComment, ...prev])
        setContent('')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to post comment')
      }
    } catch (err) {
      setError('Failed to post comment')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    if (deleting) return

    setDeleting(commentId)
    setError(null)

    try {
      const res = await fetch(`/api/entities/${entityId}/comments?commentId=${commentId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId))
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to delete comment')
      }
    } catch (err) {
      setError('Failed to delete comment')
    } finally {
      setDeleting(null)
    }
  }

  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="section-ornament">💬</span>
          Comments
          {comments.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({comments.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Comment Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[80px] resize-none"
            disabled={sending}
            maxLength={2000}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {content.length}/2000
            </span>
            <Button type="submit" size="sm" disabled={!content.trim() || sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Post
            </Button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="text-sm text-destructive text-center py-2">
            {error}
          </div>
        )}

        {/* Comments List */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={comment.user.image || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(comment.user.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">
                      {comment.user.name || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(comment.createdAt)}
                    </span>
                    {(isDM || comment.user.id === currentUserId) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 ml-auto opacity-50 hover:opacity-100"
                        onClick={() => handleDelete(comment.id)}
                        disabled={deleting === comment.id}
                      >
                        {deleting === comment.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {comment.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
