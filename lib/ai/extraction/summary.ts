import { db, entities, entityFacts, factMentions } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { generateSimple } from '@/lib/ai/client'
import type { AIModel, FactSection } from '@/lib/db/schema'

interface FactWithMentions {
  id: string
  content: string
  section: FactSection
  isDmOnly: boolean
  mentions: Array<{
    name: string
    relationshipType: string | null
  }>
}

/**
 * Generate a wiki-style summary for an entity from its accumulated facts
 */
export async function generateEntitySummary(
  entityId: string,
  model: AIModel = 'claude-3-5-haiku-20241022'
): Promise<string> {
  // Get the entity
  const entity = await db.query.entities.findFirst({
    where: eq(entities.id, entityId),
  })

  if (!entity) {
    throw new Error('Entity not found')
  }

  // Get all facts with mentions
  const facts = await db.query.entityFacts.findMany({
    where: eq(entityFacts.entityId, entityId),
    with: {
      mentions: {
        with: {
          mentionedEntity: {
            columns: { name: true },
          },
        },
      },
    },
    orderBy: (entityFacts, { asc }) => [asc(entityFacts.section), asc(entityFacts.createdAt)],
  })

  if (facts.length === 0) {
    // No facts yet, return legacy content or placeholder
    return entity.content || `A ${entity.entityType} in the campaign.`
  }

  // Group facts by section
  const grouped = new Map<string, FactWithMentions[]>()
  const dmOnlyFacts: FactWithMentions[] = []

  for (const fact of facts) {
    const factWithMentions: FactWithMentions = {
      id: fact.id,
      content: fact.content,
      section: fact.section as FactSection,
      isDmOnly: fact.isDmOnly || false,
      mentions: fact.mentions.map((m) => ({
        name: (m as any).mentionedEntity?.name || 'Unknown',
        relationshipType: m.relationshipType,
      })),
    }

    if (fact.isDmOnly) {
      dmOnlyFacts.push(factWithMentions)
    } else {
      if (!grouped.has(fact.section)) {
        grouped.set(fact.section, [])
      }
      grouped.get(fact.section)!.push(factWithMentions)
    }
  }

  // Build the prompt
  const sectionOrder: FactSection[] = [
    'appearance', 'personality', 'abilities', 'possessions',
    'location', 'relationships', 'history', 'goals', 'other'
  ]

  let factsText = ''
  for (const section of sectionOrder) {
    const sectionFacts = grouped.get(section)
    if (sectionFacts && sectionFacts.length > 0) {
      factsText += `\n## ${capitalize(section)}\n`
      for (const fact of sectionFacts) {
        factsText += `- ${fact.content}\n`
      }
    }
  }

  if (dmOnlyFacts.length > 0) {
    factsText += `\n## DM Notes (Secret)\n`
    for (const fact of dmOnlyFacts) {
      factsText += `- ${fact.content}\n`
    }
  }

  const prompt = `Generate a wiki article for this RPG entity based on the facts below.

ENTITY: ${entity.name} (${entity.entityType})

KNOWN FACTS:
${factsText}

INSTRUCTIONS:
1. Write natural, cohesive prose - not just a list of facts
2. Use [[Entity Name]] wikilinks when mentioning other entities
3. Keep the same sections as provided, but write in paragraphs
4. For appearance, write a descriptive paragraph
5. For history, write a narrative of events in chronological order if possible
6. Keep DM Notes in a separate section at the end, marked as secret
7. If there are few facts, keep it brief - don't pad with filler
8. Start with a one-sentence summary of who/what this entity is

OUTPUT: Markdown wiki article (no code blocks, just the article content)`

  const summary = await generateSimple(model, prompt, '', 2048)

  if (!summary) {
    // Fallback: generate simple structured summary
    return generateStructuredSummary(entity, grouped, dmOnlyFacts)
  }

  return summary
}

/**
 * Fallback: generate a simple structured summary without AI
 */
function generateStructuredSummary(
  entity: { name: string; entityType: string },
  grouped: Map<string, FactWithMentions[]>,
  dmOnlyFacts: FactWithMentions[]
): string {
  const lines: string[] = []

  lines.push(`**${entity.name}** is a ${entity.entityType}.`)
  lines.push('')

  const sectionOrder: FactSection[] = [
    'appearance', 'personality', 'abilities', 'possessions',
    'location', 'relationships', 'history', 'goals', 'other'
  ]

  for (const section of sectionOrder) {
    const facts = grouped.get(section)
    if (facts && facts.length > 0) {
      lines.push(`## ${capitalize(section)}`)
      for (const fact of facts) {
        lines.push(`- ${fact.content}`)
      }
      lines.push('')
    }
  }

  if (dmOnlyFacts.length > 0) {
    lines.push(`## DM Notes`)
    lines.push(`> These notes are only visible to the DM.`)
    lines.push('')
    for (const fact of dmOnlyFacts) {
      lines.push(`- ${fact.content}`)
    }
  }

  return lines.join('\n')
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Update entity summary and timestamp
 */
export async function updateEntitySummary(
  entityId: string,
  model: AIModel = 'claude-3-5-haiku-20241022'
): Promise<void> {
  const summary = await generateEntitySummary(entityId, model)

  await db
    .update(entities)
    .set({
      summary,
      summaryGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(entities.id, entityId))
}

/**
 * Regenerate summaries for all entities in a campaign
 */
export async function regenerateCampaignSummaries(
  campaignId: string,
  model: AIModel = 'claude-3-5-haiku-20241022',
  onProgress?: (current: number, total: number, entityName: string) => void
): Promise<{ success: number; failed: number }> {
  const allEntities = await db.query.entities.findMany({
    where: eq(entities.campaignId, campaignId),
    columns: { id: true, name: true },
  })

  let success = 0
  let failed = 0

  for (let i = 0; i < allEntities.length; i++) {
    const entity = allEntities[i]
    onProgress?.(i + 1, allEntities.length, entity.name)

    try {
      await updateEntitySummary(entity.id, model)
      success++
    } catch (error) {
      console.error(`Failed to generate summary for ${entity.name}:`, error)
      failed++
    }
  }

  return { success, failed }
}
