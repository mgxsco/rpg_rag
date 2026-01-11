import { db, entities, Entity } from '@/lib/db'
import { eq, and, or, sql, ilike } from 'drizzle-orm'

/**
 * Find existing entity by name, canonical name, or aliases
 */
export async function findExistingEntity(
  campaignId: string,
  name: string,
  aliases: string[] = []
): Promise<Entity | null> {
  const canonicalName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Search by canonical name first (fastest)
  const byCanonical = await db.query.entities.findFirst({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.canonicalName, canonicalName)
    ),
  })

  if (byCanonical) {
    return byCanonical
  }

  // Search by exact name match (case-insensitive)
  const byName = await db.query.entities.findFirst({
    where: and(
      eq(entities.campaignId, campaignId),
      ilike(entities.name, name)
    ),
  })

  if (byName) {
    return byName
  }

  // Search in aliases
  // Using SQL to check if name is in the aliases array
  const byAlias = await db.query.entities.findFirst({
    where: and(
      eq(entities.campaignId, campaignId),
      sql`${name} = ANY(${entities.aliases})`
    ),
  })

  if (byAlias) {
    return byAlias
  }

  // Check if any of the new aliases match existing entity names
  for (const alias of aliases) {
    const byAliasName = await db.query.entities.findFirst({
      where: and(
        eq(entities.campaignId, campaignId),
        or(
          ilike(entities.name, alias),
          sql`${alias} = ANY(${entities.aliases})`
        )
      ),
    })

    if (byAliasName) {
      return byAliasName
    }
  }

  return null
}

/**
 * Get all entity names for a campaign (for linking suggestions)
 */
export async function getExistingEntityNames(campaignId: string): Promise<string[]> {
  const allEntities = await db
    .select({ name: entities.name })
    .from(entities)
    .where(eq(entities.campaignId, campaignId))

  return allEntities.map(e => e.name)
}

/**
 * Get entity by canonical name
 */
export async function getEntityByCanonicalName(
  campaignId: string,
  canonicalName: string
): Promise<Entity | null> {
  const result = await db.query.entities.findFirst({
    where: and(
      eq(entities.campaignId, campaignId),
      eq(entities.canonicalName, canonicalName)
    ),
  })
  return result ?? null
}

/**
 * Merge aliases into existing entity
 */
export async function mergeAliases(
  entityId: string,
  newAliases: string[]
): Promise<void> {
  const entity = await db.query.entities.findFirst({
    where: eq(entities.id, entityId),
  })

  if (!entity) return

  const existingAliases = entity.aliases || []
  const mergedAliases = [...new Set([...existingAliases, ...newAliases])]

  await db
    .update(entities)
    .set({
      aliases: mergedAliases,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, entityId))
}

/**
 * Calculate similarity score between two entity names
 * Uses Levenshtein distance normalized by string length
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const s1 = name1.toLowerCase()
  const s2 = name2.toLowerCase()

  if (s1 === s2) return 1.0

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8
  }

  // Levenshtein distance
  const matrix: number[][] = []
  const len1 = s1.length
  const len2 = s2.length

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  const distance = matrix[len1][len2]
  const maxLen = Math.max(len1, len2)
  return 1 - distance / maxLen
}

/**
 * Find potential duplicates for a new entity name
 */
export async function findPotentialDuplicates(
  campaignId: string,
  name: string,
  threshold: number = 0.7
): Promise<Array<{ entity: Entity; similarity: number }>> {
  const allEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.campaignId, campaignId))

  const matches: Array<{ entity: Entity; similarity: number }> = []

  for (const entity of allEntities) {
    // Check main name
    const nameSimilarity = calculateNameSimilarity(name, entity.name)
    if (nameSimilarity >= threshold) {
      matches.push({ entity, similarity: nameSimilarity })
      continue
    }

    // Check aliases
    for (const alias of entity.aliases || []) {
      const aliasSimilarity = calculateNameSimilarity(name, alias)
      if (aliasSimilarity >= threshold) {
        matches.push({ entity, similarity: aliasSimilarity })
        break
      }
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity)
}
