import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, campaigns, entities, relationships } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkdownRenderer } from '@/components/editor/markdown-renderer'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface PublicEntityPageProps {
  params: Promise<{ slug: string; entityId: string }>
}

export default async function PublicEntityPage({ params }: PublicEntityPageProps) {
  const { slug, entityId } = await params

  // Get campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.publicSlug, slug),
    columns: {
      id: true,
      name: true,
      isPublic: true,
    },
  })

  if (!campaign || !campaign.isPublic) {
    notFound()
  }

  // Get entity
  const entity = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, entityId),
      eq(entities.campaignId, campaign.id)
    ),
  })

  if (!entity || entity.isDmOnly) {
    notFound()
  }

  // Get all public entities for relationship lookups
  const allPublicEntities = await db.query.entities.findMany({
    where: and(
      eq(entities.campaignId, campaign.id),
      eq(entities.isDmOnly, false)
    ),
    columns: {
      id: true,
      name: true,
      canonicalName: true,
      entityType: true,
      content: true,
    },
  })

  const publicEntityIds = new Set(allPublicEntities.map((e) => e.id))

  // Get outgoing relationships (only to public entities)
  const outgoingRels = await db.query.relationships.findMany({
    where: eq(relationships.sourceEntityId, entityId),
    with: {
      targetEntity: {
        columns: {
          id: true,
          name: true,
          canonicalName: true,
          entityType: true,
          isDmOnly: true,
        },
      },
    },
  })

  const filteredOutgoing = outgoingRels.filter((r) => publicEntityIds.has(r.targetEntityId))

  // Get incoming relationships (only from public entities)
  const incomingRels = await db.query.relationships.findMany({
    where: eq(relationships.targetEntityId, entityId),
    with: {
      sourceEntity: {
        columns: {
          id: true,
          name: true,
          canonicalName: true,
          entityType: true,
          isDmOnly: true,
        },
      },
    },
  })

  const filteredIncoming = incomingRels.filter((r) => publicEntityIds.has(r.sourceEntityId))

  // Find content backlinks (public entities that mention this one)
  const searchTerms = [entity.name, ...(entity.aliases || [])]
  const contentBacklinks = allPublicEntities.filter((e) => {
    if (e.id === entity.id) return false
    const content = e.content?.toLowerCase() || ''
    return searchTerms.some(
      (term) =>
        content.includes(`[[${term.toLowerCase()}]]`) ||
        content.includes(`[[${term}]]`)
    )
  })

  // Build entity map for wikilink resolution (public entities only)
  const entityMap = new Map(
    allPublicEntities.map((e) => [e.name.toLowerCase(), e.id])
  )

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href={`/public/${slug}/entities`}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to wiki
      </Link>

      <article>
        {/* Header Ornament */}
        <div className="header-ornament">
          <span>---</span>
          <span className="ornament-center">*</span>
          <span>---</span>
        </div>

        <header className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{entity.name}</h1>
          <Badge variant="outline" className="mb-2">
            {entity.entityType.replace('_', ' ')}
          </Badge>
          {entity.aliases && entity.aliases.length > 0 && (
            <p className="text-sm text-muted-foreground italic">
              Also known as: {entity.aliases.join(', ')}
            </p>
          )}
          {entity.entityType === 'session' && (
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {entity.sessionNumber && (
                <span>Session #{entity.sessionNumber}</span>
              )}
              {entity.sessionDate && (
                <span>{new Date(entity.sessionDate).toLocaleDateString()}</span>
              )}
              {entity.inGameDate && (
                <span>In-game: {entity.inGameDate}</span>
              )}
              {entity.sessionStatus && (
                <Badge variant="secondary">{entity.sessionStatus}</Badge>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            Last updated {new Date(entity.updatedAt).toLocaleString()}
          </p>
        </header>

        {/* Content */}
        <Card className="mb-6">
          <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer
              content={entity.content || ''}
              campaignId={campaign.id}
              noteMap={entityMap}
              isEntityMode={true}
              isPublicMode={true}
              publicSlug={slug}
            />
          </CardContent>
        </Card>

        {/* Relationships */}
        {filteredOutgoing.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Relationships</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredOutgoing.map((rel) => (
                  <div key={rel.id} className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">
                      {rel.relationshipType.replace('_', ' ')}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Link
                      href={`/public/${slug}/entities/${rel.targetEntity.id}`}
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

        {/* Backlinks */}
        {(filteredIncoming.length > 0 || contentBacklinks.length > 0) && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Backlinks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Relationship backlinks */}
                {filteredIncoming.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      Linked from relationships
                    </h4>
                    <div className="space-y-2">
                      {filteredIncoming.map((rel) => (
                        <div key={rel.id} className="flex items-center gap-2">
                          <Link
                            href={`/public/${slug}/entities/${rel.sourceEntity.id}`}
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
                            href={`/public/${slug}/entities/${e.id}`}
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

        {/* Tags */}
        {entity.tags && entity.tags.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {entity.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </article>
    </div>
  )
}
