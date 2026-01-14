import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { NoteCard } from '@/components/notes/note-card'
import { NotesActions } from '@/components/notes/notes-actions'
import { Search, Filter } from 'lucide-react'
import { NoteType } from '@/lib/types'

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'session', label: 'Session' },
  { value: 'npc', label: 'NPC' },
  { value: 'location', label: 'Location' },
  { value: 'item', label: 'Item' },
  { value: 'lore', label: 'Lore' },
  { value: 'quest', label: 'Quest' },
  { value: 'faction', label: 'Faction' },
  { value: 'player_character', label: 'Player Character' },
  { value: 'freeform', label: 'Freeform' },
]

export default async function NotesPage({
  params,
  searchParams,
}: {
  params: { campaignId: string }
  searchParams: { type?: string; search?: string }
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

  // Get notes
  let allNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.campaignId, params.campaignId))
    .orderBy(desc(notes.updatedAt))

  // Filter by type
  if (searchParams.type) {
    allNotes = allNotes.filter((n) => n.noteType === searchParams.type)
  }

  // Filter by search
  if (searchParams.search) {
    const searchLower = searchParams.search.toLowerCase()
    allNotes = allNotes.filter((n) => n.title.toLowerCase().includes(searchLower))
  }

  // Filter DM-only for non-DMs
  if (!isDM) {
    allNotes = allNotes.filter((n) => !n.isDmOnly)
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Notes</h1>
          <NotesActions campaignId={params.campaignId} />
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          <form className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search notes..."
                defaultValue={searchParams.search}
                className="pl-9"
              />
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <Link href={`/campaigns/${params.campaignId}/notes`}>
              <Badge
                variant={!searchParams.type ? 'default' : 'outline'}
                className="cursor-pointer"
              >
                All
              </Badge>
            </Link>
            {NOTE_TYPES.map((type) => (
              <Link
                key={type.value}
                href={`/campaigns/${params.campaignId}/notes?type=${type.value}`}
              >
                <Badge
                  variant={searchParams.type === type.value ? 'default' : 'outline'}
                  className={`cursor-pointer ${searchParams.type === type.value ? '' : `note-type-${type.value}`}`}
                >
                  {type.label}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        {allNotes.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                campaignId={params.campaignId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Filter className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No notes found</h3>
            <p>
              {searchParams.type || searchParams.search
                ? 'Try adjusting your filters'
                : 'Create your first note to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
