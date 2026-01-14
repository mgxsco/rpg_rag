import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities, relationships, entitySources, users } from '@/lib/db'
import { eq, and, or } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import { EntityDetailActions } from '@/components/entities/entity-detail-actions'
import { EntityComments } from '@/components/entities/entity-comments'
import {
  Edit,
  Lock,
  ArrowLeft,
  History,
  Link as LinkIcon,
  FileText,
  ArrowRight,
  User,
} from 'lucide-react'

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

      <div className="flex-1 min-w-0 max-w-5xl">
        <Link
          href={`/campaigns/${params.campaignId}/entities`}
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to wiki
        </Link>

        <article>
          {/* Header Ornament */}
          <div className="header-ornament">
            <span>◆━━</span>
            <span className="ornament-center">⚜</span>
            <span>━━◆</span>
          </div>

          <header className="mb-4">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="entity-detail-title text-3xl font-bold mb-2 flex items-center gap-2">
                  {entity.name}
                  {entity.isDmOnly && (
                    <Lock className="dm-lock-icon h-5 w-5" />
                  )}
                </h1>
                <Badge variant="outline" className="entity-type-badge mb-2">
                  {entity.entityType.replace('_', ' ')}
                </Badge>
                {entity.aliases && entity.aliases.length > 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    Also known as: {entity.aliases.join(', ')}
                  </p>
                )}
                {entity.entityType === 'player_character' && entity.player && (
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <User className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Played by:</span>
                    <span className="font-medium">
                      {entity.player.user.name || entity.player.user.email}
                    </span>
                  </div>
                )}
              </div>
              {isDM && (
                <EntityDetailActions
                  entityId={params.entityId}
                  entityName={entity.name}
                  campaignId={params.campaignId}
                  entityType={entity.entityType}
                  hasContent={!!entity.content && entity.content.length > 100}
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Last updated {new Date(entity.updatedAt).toLocaleString()}
            </p>

            {/* Gold separator */}
            <div className="separator-gold my-4" />
          </header>

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

          {/* Relationships */}
          {outgoingRels.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="section-ornament">⚔</span>
                  Relationships
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {outgoingRels.map((rel) => (
                    <div key={rel.id} className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0">
                        {rel.relationshipType.replace('_', ' ')}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Link
                        href={`/campaigns/${params.campaignId}/entities/${rel.targetEntity.id}`}
                        className="text-primary hover:underline"
                      >
                        {rel.targetEntity.name}
                      </Link>
                      <Badge variant="secondary" className="text-xs">
                        {rel.targetEntity.entityType.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Backlinks (Incoming Relationships) */}
          {(incomingRels.length > 0 || contentBacklinks.length > 0) && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="section-ornament">🔗</span>
                  Backlinks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Relationship backlinks */}
                  {incomingRels.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">
                        Linked from relationships
                      </h4>
                      <div className="space-y-2">
                        {incomingRels.map((rel) => (
                          <div key={rel.id} className="flex items-center gap-2">
                            <Link
                              href={`/campaigns/${params.campaignId}/entities/${rel.sourceEntity.id}`}
                              className="text-primary hover:underline"
                            >
                              {rel.sourceEntity.name}
                            </Link>
                            <Badge variant="secondary" className="text-xs">
                              {rel.sourceEntity.entityType.replace('_', ' ')}
                            </Badge>
                            <span className="text-muted-foreground text-sm">
                              ({rel.reverseLabel || rel.relationshipType.replace('_', ' ')})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Content backlinks */}
                  {contentBacklinks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">
                        Mentioned in
                      </h4>
                      <div className="space-y-2">
                        {contentBacklinks.map((e) => (
                          <div key={e.id} className="flex items-center gap-2">
                            <Link
                              href={`/campaigns/${params.campaignId}/entities/${e.id}`}
                              className="text-primary hover:underline"
                            >
                              {e.name}
                            </Link>
                            <Badge variant="secondary" className="text-xs">
                              {e.entityType.replace('_', ' ')}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Source Documents */}
          {sources.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="section-ornament">📜</span>
                  Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sources.map((source) => (
                    <div key={source.id} className="border-l-2 border-muted pl-4">
                      <p className="font-medium text-sm">{source.document.name}</p>
                      {source.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          "{source.excerpt}"
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Extracted {new Date(source.document.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comments Section */}
          <EntityComments
            entityId={params.entityId}
            currentUserId={session.user.id}
            isDM={isDM}
          />
        </article>
      </div>
    </div>
  )
}
