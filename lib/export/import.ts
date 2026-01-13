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
import { CampaignBackup } from './backup'

interface ImportResult {
  campaignId: string
  campaignName: string
  stats: {
    members: number
    entities: number
    relationships: number
    documents: number
    entitySources: number
    entityVersions: number
  }
  warnings: string[]
}

export async function importCampaignBackup(
  backup: CampaignBackup,
  importerId: string
): Promise<ImportResult> {
  const warnings: string[] = []

  // Validate backup version
  if (backup.version !== '1.0') {
    throw new Error(`Unsupported backup version: ${backup.version}`)
  }

  // Create user email to ID mapping
  const allUsers = await db.query.users.findMany()
  const emailToUserId = new Map(allUsers.map((u) => [u.email, u.id]))

  // Get importer user
  const importerUser = await db.query.users.findFirst({
    where: eq(users.id, importerId),
  })

  if (!importerUser) {
    throw new Error('Importer user not found')
  }

  // Create campaign
  const [newCampaign] = await db
    .insert(campaigns)
    .values({
      name: backup.campaign.name,
      description: backup.campaign.description,
      language: backup.campaign.language,
      settings: backup.campaign.settings,
      ownerId: importerId,
    })
    .returning()

  // Import members
  let membersImported = 0
  const memberEmailToId = new Map<string, string>()

  for (const member of backup.members) {
    const userId = emailToUserId.get(member.email)

    if (userId) {
      try {
        const [newMember] = await db
          .insert(campaignMembers)
          .values({
            campaignId: newCampaign.id,
            userId,
            role: member.role,
          })
          .returning()

        memberEmailToId.set(member.email, newMember.id)
        membersImported++
      } catch (error) {
        // Member might already exist or other constraint violation
        warnings.push(`Could not add member ${member.email}: ${error}`)
      }
    } else {
      warnings.push(`User ${member.email} not found - skipping member`)
    }
  }

  // Add importer as DM if not already a member
  if (!memberEmailToId.has(importerUser.email)) {
    const [importerMember] = await db
      .insert(campaignMembers)
      .values({
        campaignId: newCampaign.id,
        userId: importerId,
        role: 'dm',
      })
      .returning()

    memberEmailToId.set(importerUser.email, importerMember.id)
    membersImported++
  }

  // Import documents
  let documentsImported = 0
  const documentNameToId = new Map<string, string>()

  for (const doc of backup.documents) {
    const uploaderId = emailToUserId.get(doc.uploaderEmail) || importerId

    const [newDoc] = await db
      .insert(documents)
      .values({
        campaignId: newCampaign.id,
        name: doc.name,
        content: doc.content,
        fileType: doc.fileType,
        uploadedBy: uploaderId,
      })
      .returning()

    documentNameToId.set(doc.name, newDoc.id)
    documentsImported++
  }

  // Import entities
  let entitiesImported = 0
  const entityCanonicalToId = new Map<string, string>()

  for (const entity of backup.entities) {
    // Get player ID if this is a player character
    let playerId: string | null = null
    if (entity.playerEmail) {
      playerId = memberEmailToId.get(entity.playerEmail) || null
      if (!playerId) {
        warnings.push(
          `Player ${entity.playerEmail} not found for character ${entity.name}`
        )
      }
    }

    const [newEntity] = await db
      .insert(entities)
      .values({
        campaignId: newCampaign.id,
        name: entity.name,
        canonicalName: entity.canonicalName,
        entityType: entity.entityType,
        content: entity.content || '',
        aliases: entity.aliases || [],
        tags: entity.tags || [],
        isDmOnly: entity.isDmOnly || false,
        sessionNumber: entity.sessionNumber,
        sessionDate: entity.sessionDate ? new Date(entity.sessionDate) : null,
        inGameDate: entity.inGameDate,
        sessionStatus: entity.sessionStatus,
        playerId,
      })
      .returning()

    entityCanonicalToId.set(entity.canonicalName, newEntity.id)
    entitiesImported++
  }

  // Import relationships
  let relationshipsImported = 0

  for (const rel of backup.relationships) {
    const sourceId = entityCanonicalToId.get(rel.sourceCanonicalName)
    const targetId = entityCanonicalToId.get(rel.targetCanonicalName)

    if (sourceId && targetId) {
      try {
        await db.insert(relationships).values({
          campaignId: newCampaign.id,
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          relationshipType: rel.relationshipType,
          reverseLabel: rel.reverseLabel,
        })
        relationshipsImported++
      } catch (error) {
        warnings.push(
          `Could not create relationship ${rel.sourceCanonicalName} -> ${rel.targetCanonicalName}: ${error}`
        )
      }
    } else {
      warnings.push(
        `Missing entity for relationship: ${rel.sourceCanonicalName} -> ${rel.targetCanonicalName}`
      )
    }
  }

  // Import entity sources
  let sourcesImported = 0

  for (const source of backup.entitySources) {
    const entityId = entityCanonicalToId.get(source.entityCanonicalName)
    const documentId = documentNameToId.get(source.documentName)

    if (entityId && documentId) {
      try {
        await db.insert(entitySources).values({
          entityId,
          documentId,
          excerpt: source.excerpt,
          confidence: source.confidence,
        })
        sourcesImported++
      } catch (error) {
        warnings.push(`Could not create entity source: ${error}`)
      }
    }
  }

  // Import entity versions
  let versionsImported = 0

  for (const version of backup.entityVersions) {
    const entityId = entityCanonicalToId.get(version.entityCanonicalName)
    const editorId = emailToUserId.get(version.editorEmail) || importerId

    if (entityId) {
      try {
        await db.insert(entityVersions).values({
          entityId,
          name: version.name,
          content: version.content,
          editedBy: editorId,
        })
        versionsImported++
      } catch (error) {
        warnings.push(`Could not create entity version: ${error}`)
      }
    }
  }

  return {
    campaignId: newCampaign.id,
    campaignName: newCampaign.name,
    stats: {
      members: membersImported,
      entities: entitiesImported,
      relationships: relationshipsImported,
      documents: documentsImported,
      entitySources: sourcesImported,
      entityVersions: versionsImported,
    },
    warnings,
  }
}

export function validateBackup(data: unknown): data is CampaignBackup {
  if (!data || typeof data !== 'object') return false

  const backup = data as Record<string, unknown>

  // Check required fields
  if (backup.version !== '1.0') return false
  if (typeof backup.exportedAt !== 'string') return false
  if (typeof backup.exportedBy !== 'string') return false

  // Check campaign object
  if (!backup.campaign || typeof backup.campaign !== 'object') return false
  const campaign = backup.campaign as Record<string, unknown>
  if (typeof campaign.name !== 'string') return false

  // Check arrays exist
  if (!Array.isArray(backup.members)) return false
  if (!Array.isArray(backup.entities)) return false
  if (!Array.isArray(backup.relationships)) return false
  if (!Array.isArray(backup.documents)) return false

  return true
}
