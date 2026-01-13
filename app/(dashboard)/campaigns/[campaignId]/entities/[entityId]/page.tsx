import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, relationships, entitySources } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import { EntityDetailActions } from '@/components/entities/entity-detail-actions'
import { EntityComments } from '@/components/entities/entity-comments'
import { EntitySidebar } from '@/components/entities/entity-sidebar'
import { EntityConnectionsTabs } from '@/components/entities/entity-connections-tabs'
import { EntitySourcesAccordion } from '@/components/entities/entity-sources-accordion'
import { Lock, ArrowLeft, User } from 'lucide-react'

export default async function EntityViewPage({
  params,
}: {
  params: { campaignId: string; entityId: string }
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

  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, params.entityId),
      eq(entities.campaignId, params.campaignId)
    ),
    with: {
      player: {
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  })

  if (!entity) {
    notFound()
  }

  // Check if non-DM is trying to access DM-only entity
  if (entity.isDmOnly && !isDM) {
    notFound()
  }

  // Get outgoing relationships
  const outgoingRels = await db.query.relationships.findMany({
    where: eq(relationships.sourceEntityId, params.entityId),
    with: {
      targetEntity: {
        columns: {
          id: true,
          name: true,
          canonicalName: true,
          entityType: true,
        },
      },
    },
  })

  // Get incoming relationships (backlinks)
  const incomingRels = await db.query.relationships.findMany({
    where: eq(relationships.targetEntityId, params.entityId),
    with: {
      sourceEntity: {
        columns: {
          id: true,
          name: true,
          canonicalName: true,
          entityType: true,
        },
      },
    },
  })

  // Get source documents
  const sources = await db.query.entitySources.findMany({
    where: eq(entitySources.entityId, params.entityId),
    with: {
      document: {
        columns: {
          id: true,
          name: true,
          createdAt: true,
        },
      },
    },
  })

  // Find content backlinks (entities that mention this one via [[wikilinks]])
  const searchTerms = [entity.name, ...(entity.aliases || [])]
  const allOtherEntities = await db.query.entities.findMany({
    where: eq(entities.campaignId, params.campaignId),
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      entityType: true,
      content: true,
      isDmOnly: true,
    },
  })

  const contentBacklinks = allOtherEntities.filter((e) => {
    if (e.id === entity.id) return false
    if (e.isDmOnly && !isDM) return false
    const content = e.content?.toLowerCase() || ''
    return searchTerms.some(
      (term) =>
        content.includes(`[[${term.toLowerCase()}]]`) ||
        content.includes(`[[${term}]]`)
    )
  })

  // Build entity map for wikilink resolution
  const entityMap = new Map(
    allOtherEntities
      .filter((e) => !e.isDmOnly || isDM)
      .map((e) => [e.name.toLowerCase(), e.id])
  )

  return (
    <div className="flex gap-3 sm:gap-4 md:gap-5">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/campaigns/${params.campaignId}/entities`}
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to wiki
        </Link>

        {/* Two Column Layout */}
        <div className="flex gap-6">
          {/* Left Column - Main Content */}
          <article className="flex-1 min-w-0 max-w-4xl">
            {/* Header Ornament */}
            <div className="header-ornament">
              <span>◆━━</span>
              <span className="ornament-center">⚜</span>
              <span>━━◆</span>
            </div>

            <header className="mb-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h1 className="entity-detail-title text-3xl font-bold mb-2 flex items-center gap-2">
                    {entity.name}
                    {entity.isDmOnly && (
                      <Lock className="dm-lock-icon h-5 w-5" />
                    )}
                  </h1>
                  {/* Mobile: Show type badge and metadata inline */}
                  <div className="flex flex-wrap items-center gap-2 lg:hidden">
                    <Badge variant="outline" className="entity-type-badge">
                      {entity.entityType.replace('_', ' ')}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Updated {new Date(entity.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {entity.aliases && entity.aliases.length > 0 && (
                    <p className="text-sm text-muted-foreground italic mt-1 lg:hidden">
                      Also known as: {entity.aliases.join(', ')}
                    </p>
                  )}
                  {entity.entityType === 'player_character' && entity.player && (
                    <div className="flex items-center gap-2 mt-2 text-sm lg:hidden">
                      <User className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Played by:</span>
                      <span className="font-medium">
                        {entity.player.user.name || entity.player.user.email}
                      </span>
                    </div>
                  )}
                </div>
                {/* Mobile: Show DM actions in header */}
                {isDM && (
                  <div className="lg:hidden">
                    <EntityDetailActions
                      entityId={params.entityId}
                      entityName={entity.name}
                      campaignId={params.campaignId}
                    />
                  </div>
                )}
              </div>

              {/* Gold separator */}
              <div className="separator-gold my-4" />
            </header>

            {/* Main Content */}
            <Card className="mb-4">
              <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer
                  content={entity.content || ''}
                  campaignId={params.campaignId}
                  noteMap={entityMap}
                  isEntityMode={true}
                />
              </CardContent>
            </Card>

            {/* Mobile: Connections and Sources (shown as cards on mobile) */}
            <div className="lg:hidden space-y-4 mb-4">
              {(outgoingRels.length > 0 || incomingRels.length > 0 || contentBacklinks.length > 0) && (
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Connections
                    </h3>
                    <EntityConnectionsTabs
                      campaignId={params.campaignId}
                      outgoingRels={outgoingRels}
                      incomingRels={incomingRels}
                      contentBacklinks={contentBacklinks}
                    />
                  </CardContent>
                </Card>
              )}

              {sources.length > 0 && (
                <EntitySourcesAccordion sources={sources} />
              )}
            </div>

            {/* Comments Section */}
            <EntityComments
              entityId={params.entityId}
              currentUserId={session.user.id}
              isDM={isDM}
            />
          </article>

          {/* Right Column - Sidebar (Desktop Only) */}
          <EntitySidebar
            entity={entity}
            campaignId={params.campaignId}
            isDM={isDM}
            outgoingRels={outgoingRels}
            incomingRels={incomingRels}
            contentBacklinks={contentBacklinks}
            sources={sources}
          />
        </div>
      </div>
    </div>
  )
}
