import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { NoteCard } from '@/components/notes/note-card'
import { Plus, Search, Filter } from 'lucide-react'
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

  let query = supabase
    .from('notes')
    .select('*')
    .eq('campaign_id', params.campaignId)
    .order('updated_at', { ascending: false })

  if (searchParams.type) {
    query = query.eq('note_type', searchParams.type)
  }

  if (searchParams.search) {
    query = query.ilike('title', `%${searchParams.search}%`)
  }

  if (!isDM) {
    query = query.eq('is_dm_only', false)
  }

  const { data: notes } = await query

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Notes</h1>
          <Link href={`/campaigns/${params.campaignId}/notes/new`}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Note
            </Button>
          </Link>
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

        {notes && notes.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notes.map((note) => (
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
