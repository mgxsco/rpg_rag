import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, BookOpen } from 'lucide-react'

export default async function CampaignsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get campaigns where user is owner or member
  const { data: ownedCampaigns } = await supabase
    .from('campaigns')
    .select('*, campaign_members(count)')
    .eq('owner_id', user?.id)
    .order('updated_at', { ascending: false })

  const { data: memberCampaigns } = await supabase
    .from('campaign_members')
    .select('campaign:campaigns(*), role')
    .eq('user_id', user?.id)
    .neq('campaign.owner_id', user?.id)

  const campaigns = [
    ...(ownedCampaigns || []).map(c => ({ ...c, role: 'owner' as const })),
    ...(memberCampaigns || []).map(m => ({ ...m.campaign, role: m.role })),
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Your Campaigns</h1>
          <p className="text-muted-foreground mt-1">Manage your D&D adventures</p>
        </div>
        <Link href="/campaigns/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first campaign to start documenting your adventures.
            </p>
            <Link href="/campaigns/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Campaign
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((campaign) => (
            <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-xl">{campaign.name}</CardTitle>
                    <Badge variant={campaign.role === 'owner' ? 'default' : 'secondary'}>
                      {campaign.role === 'owner' ? 'Owner' : campaign.role?.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {campaign.description || 'No description'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="h-4 w-4 mr-1" />
                    <span>
                      {campaign.campaign_members?.[0]?.count || 1} member(s)
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
