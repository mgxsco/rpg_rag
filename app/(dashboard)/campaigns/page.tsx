import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, or, desc } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, BookOpen } from 'lucide-react'
import { ensureCampaignLanguageColumn, ensureCampaignSettingsColumn, ensureCampaignMembersJoinedAt } from '@/lib/db/migrations'
import { ImportDialog } from '@/components/campaigns/import-dialog'

export default async function CampaignsPage() {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Ensure columns exist before querying
  await ensureCampaignLanguageColumn()
  await ensureCampaignSettingsColumn()
  await ensureCampaignMembersJoinedAt()

  // Get owned campaigns
  const ownedCampaigns = await db.query.campaigns.findMany({
    where: eq(campaigns.ownerId, session.user.id),
    with: {
      members: true,
    },
    orderBy: [desc(campaigns.updatedAt)],
  })

  // Get campaigns where user is a member
  const memberships = await db.query.campaignMembers.findMany({
    where: eq(campaignMembers.userId, session.user.id),
    with: {
      campaign: {
        with: {
          members: true,
        },
      },
    },
  })

  // Combine and dedupe
  const ownedIds = new Set(ownedCampaigns.map((c) => c.id))
  const memberCampaigns = memberships
    .filter((m) => !ownedIds.has(m.campaignId))
    .map((m) => ({ ...m.campaign, role: m.role }))

  const allCampaigns = [
    ...ownedCampaigns.map((c) => ({ ...c, role: 'owner' as const })),
    ...memberCampaigns,
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Your Campaigns</h1>
          <p className="text-muted-foreground mt-1">Manage your D&D adventures</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportDialog />
          <Link href="/campaigns/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {allCampaigns.length === 0 ? (
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
          {allCampaigns.map((campaign) => (
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
                    <span>{campaign.members?.length || 1} member(s)</span>
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
