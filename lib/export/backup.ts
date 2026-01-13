import { db } from '@/lib/db'
import {
  campaigns,
  campaignMembers,
  entities,
  relationships,
  documents,
  entitySources,
  entityVersions,
  users,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface CampaignBackup {
  version: '1.0'
  exportedAt: string
  exportedBy: string

  campaign: {
    name: string
    description: string | null
    language: string
    settings: Record<string, unknown>
    createdAt: string
    updatedAt: string
  }

  members: Array<{
    email: string
    name: string | null
    role: 'dm' | 'player' | 'viewer'
    joinedAt: string
  }>

  entities: Array<{
    id: string
    name: string
    canonicalName: string
    entityType: string
    content: string | null
    aliases: string[] | null
    tags: string[] | null
    isDmOnly: boolean | null
    sessionNumber: number | null
    sessionDate: string | null
    inGameDate: string | null
    sessionStatus: string | null
    playerEmail: string | null
    createdAt: string
    updatedAt: string
  }>

  relationships: Array<{
    sourceCanonicalName: string
    targetCanonicalName: string
    relationshipType: string
    reverseLabel: string | null
    createdAt: string
  }>

  documents: Array<{
    id: string
    name: string
    content: string
    fileType: string | null
    uploaderEmail: string
    createdAt: string
  }>

  entitySources: Array<{
    entityCanonicalName: string
    documentName: string
    excerpt: string | null
    confidence: string | null
    createdAt: string
  }>

  entityVersions: Array<{
    entityCanonicalName: string
    name: string
    content: string
    editorEmail: string
    createdAt: string
  }>
}

export async function generateBackupExport(
  campaignId: string,
  exporterEmail: string
): Promise<CampaignBackup> {
  // Fetch campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    throw new Error('Campaign not found')
  }

  // Fetch members with user info
  const membersData = await db.query.campaignMembers.findMany({
    where: eq(campaignMembers.campaignId, campaignId),
    with: {
      user: true,
    },
  })

  // Fetch all entities with player info
  const entitiesData = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    with: {
      player: {
        with: {
          user: true,
        },
      },
    },
  })

  // Create entity ID to canonical name map
  const entityIdToCanonical = new Map(
    entitiesData.map((e) => [e.id, e.canonicalName])
  )

  // Fetch relationships
  const relationshipsData = await db.query.relationships.findMany({
    where: eq(relationships.campaignId, campaignId),
  })

  // Fetch documents with uploader info
  const documentsData = await db.query.documents.findMany({
    where: eq(documents.campaignId, campaignId),
    with: {
      uploader: true,
    },
  })

  // Create document ID to name map
  const documentIdToName = new Map(documentsData.map((d) => [d.id, d.name]))

  // Get entity IDs for this campaign
  const entityIds = new Set(entitiesData.map((e) => e.id))

  // Fetch entity sources for this campaign's entities
  const allSources = await db.query.entitySources.findMany({
    with: {
      entity: true,
      document: true,
    },
  })
  const campaignSources = allSources.filter(
    (s) => entityIds.has(s.entityId)
  )

  // Fetch entity versions for this campaign's entities
  const allVersions = await db.query.entityVersions.findMany({
    with: {
      entity: true,
      editor: true,
    },
  })
  const campaignVersions = allVersions.filter(
    (v) => entityIds.has(v.entityId)
  )

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: exporterEmail,

    campaign: {
      name: campaign.name,
      description: campaign.description,
      language: campaign.language,
      settings: (campaign.settings as Record<string, unknown>) || {},
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    },

    members: membersData.map((m) => ({
      email: m.user.email,
      name: m.user.name,
      role: m.role as 'dm' | 'player' | 'viewer',
      joinedAt: m.joinedAt.toISOString(),
    })),

    entities: entitiesData.map((e) => ({
      id: e.id,
      name: e.name,
      canonicalName: e.canonicalName,
      entityType: e.entityType,
      content: e.content,
      aliases: e.aliases,
      tags: e.tags,
      isDmOnly: e.isDmOnly,
      sessionNumber: e.sessionNumber,
      sessionDate: e.sessionDate?.toISOString() || null,
      inGameDate: e.inGameDate,
      sessionStatus: e.sessionStatus,
      playerEmail: e.player?.user?.email || null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),

    relationships: relationshipsData.map((r) => ({
      sourceCanonicalName: entityIdToCanonical.get(r.sourceEntityId) || '',
      targetCanonicalName: entityIdToCanonical.get(r.targetEntityId) || '',
      relationshipType: r.relationshipType,
      reverseLabel: r.reverseLabel,
      createdAt: r.createdAt.toISOString(),
    })),

    documents: documentsData.map((d) => ({
      id: d.id,
      name: d.name,
      content: d.content,
      fileType: d.fileType,
      uploaderEmail: d.uploader.email,
      createdAt: d.createdAt.toISOString(),
    })),

    entitySources: campaignSources.map((s) => ({
      entityCanonicalName: s.entity.canonicalName,
      documentName: s.document.name,
      excerpt: s.excerpt,
      confidence: s.confidence,
      createdAt: s.createdAt.toISOString(),
    })),

    entityVersions: campaignVersions.map((v) => ({
      entityCanonicalName: v.entity.canonicalName,
      name: v.name,
      content: v.content,
      editorEmail: v.editor.email,
      createdAt: v.createdAt.toISOString(),
    })),
  }
}
