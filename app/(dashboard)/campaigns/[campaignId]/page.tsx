import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { BookOpen, MessageSquare, Network, Users, FileText, Plus } from 'lucide-react'

export default async function CampaignHomePage({
  params,
}: {
  params: { campaignId: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.campaignId)
    .single()

  if (!campaign) {
    notFound()
  }

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', user?.id)
    .single()

  const isDM = membership?.role === 'dm' || campaign.owner_id === user?.id

  // Get counts
  const { count: notesCount } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', params.campaignId)

  const { count: membersCount } = await supabase
    .from('campaign_members')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', params.campaignId)

  // Get recent notes
  const { data: recentNotes } = await supabase
    .from('notes')
    .select('id, title, slug, note_type, updated_at')
    .eq('campaign_id', params.campaignId)
    .order('updated_at', { ascending: false })
    .limit(5)

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{campaign.name}</h1>
            <Badge variant={isDM ? 'default' : 'secondary'}>
              {isDM ? 'DM' : membership?.role?.toUpperCase() || 'MEMBER'}
            </Badge>
          </div>
          {campaign.description && (
            <p className="text-muted-foreground">{campaign.description}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<FileText className="h-5 w-5" />}
            label="Notes"
            value={notesCount || 0}
            href={`/campaigns/${params.campaignId}/notes`}
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Members"
            value={membersCount || 0}
            href={`/campaigns/${params.campaignId}/settings`}
          />
          <StatCard
            icon={<Network className="h-5 w-5" />}
            label="Knowledge Graph"
            value="View"
            href={`/campaigns/${params.campaignId}/graph`}
          />
          <StatCard
            icon={<MessageSquare className="h-5 w-5" />}
            label="AI Chat"
            value="Ask"
            href={`/campaigns/${params.campaignId}/chat`}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Notes</CardTitle>
                <CardDescription>Latest updates to your campaign</CardDescription>
              </div>
              <Link href={`/campaigns/${params.campaignId}/notes/new`}>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  New Note
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentNotes && recentNotes.length > 0 ? (
                <div className="space-y-3">
                  {recentNotes.map((note) => (
                    <Link
                      key={note.id}
                      href={`/campaigns/${params.campaignId}/notes/${note.slug}`}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`note-type-${note.note_type}`}>
                          {note.note_type}
                        </Badge>
                        <span className="font-medium">{note.title}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(note.updated_at).toLocaleDateString()}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2" />
                  <p>No notes yet. Create your first note!</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>Common tasks for your campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/campaigns/${params.campaignId}/notes/new?type=session`}>
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-2" />
                  Log a Session
                </Button>
              </Link>
              <Link href={`/campaigns/${params.campaignId}/notes/new?type=npc`}>
                <Button variant="outline" className="w-full justify-start">
                  <Users className="h-4 w-4 mr-2" />
                  Add an NPC
                </Button>
              </Link>
              <Link href={`/campaigns/${params.campaignId}/notes/new?type=location`}>
                <Button variant="outline" className="w-full justify-start">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Document a Location
                </Button>
              </Link>
              <Link href={`/campaigns/${params.campaignId}/chat`}>
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Ask AI about Campaign
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  href: string
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary transition-colors cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="text-primary">{icon}</div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
