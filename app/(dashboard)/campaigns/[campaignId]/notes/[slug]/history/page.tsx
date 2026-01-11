import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes, noteVersions, users } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Clock, User } from 'lucide-react'

export default async function NoteHistoryPage({
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

  // Only DMs can view history
  if (!isDM) {
    redirect(`/campaigns/${params.campaignId}/notes/${params.slug}`)
  }

  const note = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, params.slug)
    ),
  })

  if (!note) {
    notFound()
  }

  // Get all versions with editor info
  const versions = await db
    .select({
      id: noteVersions.id,
      title: noteVersions.title,
      content: noteVersions.content,
      createdAt: noteVersions.createdAt,
      editorId: noteVersions.editedBy,
      editorName: users.name,
      editorEmail: users.email,
    })
    .from(noteVersions)
    .leftJoin(users, eq(noteVersions.editedBy, users.id))
    .where(eq(noteVersions.noteId, note.id))
    .orderBy(desc(noteVersions.createdAt))

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href={`/campaigns/${params.campaignId}/notes/${params.slug}`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to note
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Version History</h1>
        <p className="text-muted-foreground">
          Viewing history for &ldquo;{note.title}&rdquo;
        </p>
      </div>

      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No previous versions</h3>
            <p className="text-muted-foreground">
              This note hasn&apos;t been edited since it was created.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {versions.map((version, index) => (
            <Card key={version.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base mb-1">
                      {version.title}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {version.editorName || version.editorEmail || 'Unknown'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    Version {versions.length - index}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-sm bg-muted p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-48">
                  {version.content || '(empty)'}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
