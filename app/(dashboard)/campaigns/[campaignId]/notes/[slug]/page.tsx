import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import { BacklinksPanel } from '@/components/notes/backlinks-panel'
import { Edit, Lock, ArrowLeft, History } from 'lucide-react'
import { ExtractEntitiesButton } from '@/components/notes/extract-entities-button'

export default async function NoteViewPage({
  params,
}: {
  params: { campaignId: string; slug: string }
}) {
  const session = await getSession()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const isDM = membership?.role === 'dm' || campaign?.ownerId === session.user.id

  const note = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, params.slug)
    ),
  })

  if (!note) {
    notFound()
  }

  // Check if non-DM is trying to access DM-only note
  if (note.isDmOnly && !isDM) {
    notFound()
  }

  // Get all notes for wikilink resolution
  const allNotes = await db
    .select({ title: notes.title, slug: notes.slug })
    .from(notes)
    .where(eq(notes.campaignId, params.campaignId))

  const noteMap = new Map(allNotes.map((n) => [n.title.toLowerCase(), n.slug]))

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0 max-w-4xl">
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
                  {note.isDmOnly && (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                </h1>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`note-type-${note.noteType}`}>
                    {note.noteType.replace('_', ' ')}
                  </Badge>
                  {note.tags?.map((tag: string) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              {isDM && (
                <div className="flex gap-2 flex-wrap">
                  <ExtractEntitiesButton
                    campaignId={params.campaignId}
                    noteSlug={params.slug}
                  />
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
              Last updated {new Date(note.updatedAt).toLocaleString()}
            </p>
          </header>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <MarkdownRenderer
                content={note.content || ''}
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
