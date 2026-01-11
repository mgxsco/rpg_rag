import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import { BacklinksPanel } from '@/components/notes/backlinks-panel'
import { Edit, Lock, ArrowLeft, History } from 'lucide-react'

export default async function NoteViewPage({
  params,
}: {
  params: { campaignId: string; slug: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.campaignId)
    .single()

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', user?.id)
    .single()

  const isDM = membership?.role === 'dm' || campaign?.owner_id === user?.id

  const { data: note } = await supabase
    .from('notes')
    .select('*')
    .eq('campaign_id', params.campaignId)
    .eq('slug', params.slug)
    .single()

  if (!note) {
    notFound()
  }

  // Check if non-DM is trying to access DM-only note
  if (note.is_dm_only && !isDM) {
    notFound()
  }

  // Get all notes for wikilink resolution
  const { data: allNotes } = await supabase
    .from('notes')
    .select('title, slug')
    .eq('campaign_id', params.campaignId)

  const noteMap = new Map(allNotes?.map((n) => [n.title.toLowerCase(), n.slug]) || [])

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1 max-w-4xl">
        <Link
          href={`/campaigns/${params.campaignId}/notes`}
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to notes
        </Link>

        <article>
          <header className="mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                  {note.title}
                  {note.is_dm_only && (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                </h1>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`note-type-${note.note_type}`}>
                    {note.note_type.replace('_', ' ')}
                  </Badge>
                  {note.tags?.map((tag: string) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              {isDM && (
                <div className="flex gap-2">
                  <Link href={`/campaigns/${params.campaignId}/notes/${params.slug}/history`}>
                    <Button variant="outline" size="sm">
                      <History className="h-4 w-4 mr-1" />
                      History
                    </Button>
                  </Link>
                  <Link href={`/campaigns/${params.campaignId}/notes/${params.slug}/edit`}>
                    <Button size="sm">
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </Link>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Last updated {new Date(note.updated_at).toLocaleString()}
            </p>
          </header>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <MarkdownRenderer
                content={note.content}
                campaignId={params.campaignId}
                noteMap={noteMap}
              />
            </CardContent>
          </Card>

          <BacklinksPanel
            noteId={note.id}
            campaignId={params.campaignId}
          />
        </article>
      </div>
    </div>
  )
}
