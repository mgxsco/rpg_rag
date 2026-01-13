import { db } from '@/lib/db'
import { campaigns, entities, relationships } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import AdmZip from 'adm-zip'

interface EntityWithRelationships {
  id: string
  name: string
  canonicalName: string
  entityType: string
  content: string | null
  aliases: string[] | null
  isDmOnly: boolean | null
  outgoingRelationships: Array<{
    relationshipType: string
    targetEntity: {
      name: string
      canonicalName: string
      entityType: string
    }
  }>
  incomingRelationships: Array<{
    relationshipType: string
    reverseLabel: string | null
    sourceEntity: {
      name: string
      canonicalName: string
      entityType: string
    }
  }>
}

const ENTITY_TYPE_ORDER = [
  'player_character',
  'npc',
  'location',
  'faction',
  'organization',
  'item',
  'artifact',
  'quest',
  'event',
  'session',
  'creature',
  'spell',
  'deity',
  'lore',
  'region',
  'race',
  'class',
  'ability',
  'condition',
  'material',
]

function getEntityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    player_character: 'Player Characters',
    npc: 'NPCs',
    location: 'Locations',
    faction: 'Factions',
    organization: 'Organizations',
    item: 'Items',
    artifact: 'Artifacts',
    quest: 'Quests',
    event: 'Events',
    session: 'Sessions',
    creature: 'Creatures',
    spell: 'Spells',
    deity: 'Deities',
    lore: 'Lore',
    region: 'Regions',
    race: 'Races',
    class: 'Classes',
    ability: 'Abilities',
    condition: 'Conditions',
    material: 'Materials',
  }
  return labels[type] || type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function resolveWikilinks(
  content: string,
  entityMap: Map<string, string>
): string {
  // Replace [[Name]] with [Name](#slug)
  return content.replace(/\[\[([^\]]+)\]\]/g, (match, name) => {
    const slug = entityMap.get(name.toLowerCase())
    if (slug) {
      return `[${name}](#${slug})`
    }
    return name // Just return the name without link if not found
  })
}

export async function generateCompiledExport(
  campaignId: string,
  includeDmOnly: boolean = true
): Promise<{ markdown: string; campaignName: string }> {
  // Fetch campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    throw new Error('Campaign not found')
  }

  // Fetch all entities with relationships
  const entitiesData = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    with: {
      outgoingRelationships: {
        with: {
          targetEntity: {
            columns: {
              name: true,
              canonicalName: true,
              entityType: true,
            },
          },
        },
      },
      incomingRelationships: {
        with: {
          sourceEntity: {
            columns: {
              name: true,
              canonicalName: true,
              entityType: true,
            },
          },
        },
      },
    },
  })

  // Filter based on DM visibility
  let filteredEntities = entitiesData
  if (!includeDmOnly) {
    filteredEntities = entitiesData.filter((e) => !e.isDmOnly)
  }

  // Build entity map for wikilink resolution
  const entityMap = new Map<string, string>()
  for (const entity of filteredEntities) {
    entityMap.set(entity.name.toLowerCase(), slugify(entity.canonicalName))
    if (entity.aliases) {
      for (const alias of entity.aliases) {
        entityMap.set(alias.toLowerCase(), slugify(entity.canonicalName))
      }
    }
  }

  // Group entities by type
  const entitiesByType = new Map<string, EntityWithRelationships[]>()
  for (const entity of filteredEntities) {
    const type = entity.entityType
    if (!entitiesByType.has(type)) {
      entitiesByType.set(type, [])
    }
    entitiesByType.get(type)!.push(entity as EntityWithRelationships)
  }

  // Sort types by predefined order, then alphabetically for unknown types
  const sortedTypes = Array.from(entitiesByType.keys()).sort((a, b) => {
    const indexA = ENTITY_TYPE_ORDER.indexOf(a)
    const indexB = ENTITY_TYPE_ORDER.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  // Build markdown
  let markdown = `# ${campaign.name}\n\n`

  if (campaign.description) {
    markdown += `${campaign.description}\n\n`
  }

  markdown += `---\n\n`

  // Table of Contents
  markdown += `## Table of Contents\n\n`
  for (const type of sortedTypes) {
    const label = getEntityTypeLabel(type)
    markdown += `- [${label}](#${slugify(label)})\n`
  }
  markdown += `\n---\n\n`

  // Entity sections
  for (const type of sortedTypes) {
    const typeEntities = entitiesByType.get(type)!
    const typeLabel = getEntityTypeLabel(type)

    // Sort entities by name
    typeEntities.sort((a, b) => a.name.localeCompare(b.name))

    markdown += `## ${typeLabel}\n\n`

    for (const entity of typeEntities) {
      markdown += `### ${entity.name}`
      if (entity.isDmOnly) {
        markdown += ` [DM Only]`
      }
      markdown += `\n\n`

      if (entity.aliases && entity.aliases.length > 0) {
        markdown += `*Also known as: ${entity.aliases.join(', ')}*\n\n`
      }

      if (entity.content) {
        const resolvedContent = resolveWikilinks(entity.content, entityMap)
        markdown += `${resolvedContent}\n\n`
      }

      // Outgoing relationships
      const outgoing = entity.outgoingRelationships || []
      const incoming = entity.incomingRelationships || []

      if (outgoing.length > 0 || incoming.length > 0) {
        markdown += `**Relationships:**\n\n`

        for (const rel of outgoing) {
          const targetSlug = slugify(rel.targetEntity.canonicalName)
          markdown += `- ${rel.relationshipType.replace('_', ' ')}: [${rel.targetEntity.name}](#${targetSlug})\n`
        }

        for (const rel of incoming) {
          const sourceSlug = slugify(rel.sourceEntity.canonicalName)
          const label = rel.reverseLabel || `${rel.relationshipType.replace('_', ' ')} by`
          markdown += `- ${label}: [${rel.sourceEntity.name}](#${sourceSlug})\n`
        }

        markdown += `\n`
      }

      markdown += `---\n\n`
    }
  }

  // Footer
  markdown += `\n---\n\n`
  markdown += `*Exported on ${new Date().toLocaleDateString()}*\n`

  return {
    markdown,
    campaignName: campaign.name,
  }
}

export async function generateCompiledZip(
  campaignId: string,
  includeDmOnly: boolean = true
): Promise<{ buffer: Buffer; filename: string }> {
  // Fetch campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  })

  if (!campaign) {
    throw new Error('Campaign not found')
  }

  // Fetch all entities with relationships
  const entitiesData = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    with: {
      outgoingRelationships: {
        with: {
          targetEntity: {
            columns: {
              name: true,
              canonicalName: true,
              entityType: true,
            },
          },
        },
      },
      incomingRelationships: {
        with: {
          sourceEntity: {
            columns: {
              name: true,
              canonicalName: true,
              entityType: true,
            },
          },
        },
      },
    },
  })

  // Filter based on DM visibility
  let filteredEntities = entitiesData
  if (!includeDmOnly) {
    filteredEntities = entitiesData.filter((e) => !e.isDmOnly)
  }

  // Build entity map for wikilink resolution
  const entityMap = new Map<string, string>()
  for (const entity of filteredEntities) {
    entityMap.set(entity.name.toLowerCase(), slugify(entity.canonicalName))
    if (entity.aliases) {
      for (const alias of entity.aliases) {
        entityMap.set(alias.toLowerCase(), slugify(entity.canonicalName))
      }
    }
  }

  // Create ZIP
  const zip = new AdmZip()

  // Group entities by type
  const entitiesByType = new Map<string, typeof entitiesData>()
  for (const entity of filteredEntities) {
    const type = entity.entityType
    if (!entitiesByType.has(type)) {
      entitiesByType.set(type, [])
    }
    entitiesByType.get(type)!.push(entity)
  }

  // Create index file
  let indexMd = `# ${campaign.name}\n\n`
  if (campaign.description) {
    indexMd += `${campaign.description}\n\n`
  }
  indexMd += `## Contents\n\n`

  // Add each entity as a separate file
  for (const [type, typeEntities] of entitiesByType) {
    const typeLabel = getEntityTypeLabel(type)
    const folderName = slugify(typeLabel)

    indexMd += `### ${typeLabel}\n\n`

    typeEntities.sort((a, b) => a.name.localeCompare(b.name))

    for (const entity of typeEntities) {
      let entityMd = `# ${entity.name}\n\n`

      if (entity.isDmOnly) {
        entityMd += `> **DM Only**\n\n`
      }

      if (entity.aliases && entity.aliases.length > 0) {
        entityMd += `*Also known as: ${entity.aliases.join(', ')}*\n\n`
      }

      if (entity.content) {
        const resolvedContent = resolveWikilinks(entity.content, entityMap)
        entityMd += `${resolvedContent}\n\n`
      }

      // Relationships
      const outgoing = entity.outgoingRelationships || []
      const incoming = entity.incomingRelationships || []

      if (outgoing.length > 0 || incoming.length > 0) {
        entityMd += `## Relationships\n\n`

        for (const rel of outgoing) {
          entityMd += `- ${rel.relationshipType.replace('_', ' ')}: ${rel.targetEntity.name}\n`
        }

        for (const rel of incoming) {
          const label = rel.reverseLabel || `${rel.relationshipType.replace('_', ' ')} by`
          entityMd += `- ${label}: ${rel.sourceEntity.name}\n`
        }
      }

      const fileName = `${slugify(entity.canonicalName)}.md`
      zip.addFile(`${folderName}/${fileName}`, Buffer.from(entityMd, 'utf-8'))

      indexMd += `- [${entity.name}](./${folderName}/${fileName})\n`
    }

    indexMd += `\n`
  }

  zip.addFile('index.md', Buffer.from(indexMd, 'utf-8'))

  const safeName = campaign.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  return {
    buffer: zip.toBuffer(),
    filename: `${safeName}-export.zip`,
  }
}
