import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateSimple } from '@/lib/ai/client'
import { getCampaignSettings, DEFAULT_PROMPTS } from '@/lib/campaign-settings'
import { AIModel } from '@/lib/db/schema'
import { v4 as uuidv4 } from 'uuid'
import type { StagedEntity } from '@/lib/types'

/**
 * Extract entities from a single chunk
 * POST /api/campaigns/{campaignId}/extract-step/chunk
 *
 * Body: {
 *   chunkContent: string,
 *   chunkIndex: number,
 *   totalChunks: number,
 *   language: string,
 *   existingEntityNames: string[],
 *   settings: { aggressiveness, extractionModel, confidenceThreshold }
 * }
 *
 * Returns: { entities: StagedEntity[], chunkIndex }
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!membership && campaign.ownerId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Not a member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json()
    const {
      chunkContent,
      chunkIndex,
      totalChunks,
      language = 'en',
      existingEntityNames = [],
      settings = {},
    } = body

    if (!chunkContent || typeof chunkContent !== 'string') {
      return new Response(JSON.stringify({ error: 'Chunk content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const aggressiveness = settings.aggressiveness || 'obsessive'
    const extractionModel: AIModel = settings.extractionModel || 'claude-3-5-haiku-20241022'
    const confidenceThreshold = settings.confidenceThreshold || 0.5

    console.log(`[Extract-Chunk] Processing chunk ${chunkIndex + 1}/${totalChunks} (${chunkContent.length} chars)`)

    // Build system prompt
    const languageInstruction = language !== 'en'
      ? `IMPORTANT: The content is in ${getLanguageName(language)}. Extract entity names as they appear in the original language, but you may provide descriptions in ${getLanguageName(language)} as well.`
      : ''

    const basePrompt = getExtractionPrompt(aggressiveness)
    const systemPrompt = `${basePrompt}\n${languageInstruction}\n\n${ENTITY_TYPES_DESCRIPTION}`

    // Call AI to extract entities
    const responseText = await generateSimple(extractionModel, systemPrompt, chunkContent, 8192)

    if (!responseText) {
      return new Response(
        JSON.stringify({ entities: [], chunkIndex }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse response
    const extraction = parseExtractionResponse(responseText, chunkIndex)

    // Filter by confidence threshold and exclude existing entities
    const existingNamesLower = new Set(existingEntityNames.map((n: string) => n.toLowerCase()))

    const filteredEntities = extraction.entities
      .filter(e => e.confidence >= confidenceThreshold)
      .filter(e => {
        const canonicalName = e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        return !existingNamesLower.has(e.name.toLowerCase()) && !existingNamesLower.has(canonicalName)
      })

    // Convert to StagedEntity format
    const stagedEntities: StagedEntity[] = filteredEntities.map((entity) => ({
      tempId: uuidv4(),
      name: entity.name,
      canonicalName: entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      entityType: entity.type,
      content: entity.description || `A ${entity.type} mentioned in the content.`,
      aliases: entity.aliases || [],
      tags: [entity.type],
      confidence: entity.confidence,
      excerpt: entity.description?.slice(0, 300) || '',
      status: 'pending' as const,
    }))

    console.log(`[Extract-Chunk] Chunk ${chunkIndex + 1}: Found ${stagedEntities.length} entities`)

    return new Response(
      JSON.stringify({
        entities: stagedEntities,
        rawRelationships: extraction.relationships, // For later relationship extraction
        chunkIndex,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Extract-Chunk] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Extraction failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Language code to name mapping
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    pt: 'Portuguese',
    'pt-BR': 'Brazilian Portuguese',
    fr: 'French',
    de: 'German',
    it: 'Italian',
  }
  return languages[code] || code
}

// Get extraction prompt based on aggressiveness
function getExtractionPrompt(aggressiveness: string): string {
  if (aggressiveness === 'conservative') {
    return DEFAULT_PROMPTS.extractionConservativePrompt
  } else if (aggressiveness === 'balanced') {
    return DEFAULT_PROMPTS.extractionBalancedPrompt
  }
  return DEFAULT_PROMPTS.extractionObsessivePrompt
}

// Entity types description
const ENTITY_TYPES_DESCRIPTION = `
ENTITY TYPES - Use the most specific type that fits. Common types include:
- npc: Named characters, villains, allies, gods, demons, historical figures
- creature: Monsters, beasts, dragons, undead, constructs
- location: Cities, dungeons, taverns, regions, planes, buildings, rooms
- item: Weapons, armor, potions, scrolls, artifacts, mundane objects
- spell: Named spells, rituals, magical effects
- ability: Skills, feats, class features, racial abilities
- faction: Guilds, organizations, cults, armies, families, political groups
- quest: Missions, objectives, bounties, contracts
- event: Battles, ceremonies, historical moments, prophecies
- lore: Legends, customs, calendar systems, magic systems
- deity: Gods, divine beings, patrons
- race: Species, peoples (elves, dwarves, etc.)
- class: Character classes, professions
- condition: Diseases, curses, magical effects
- material: Special materials (mithril, adamantine, etc.)
- region: Geographic areas, kingdoms, continents
- artifact: Legendary/unique items
- session: Play session summaries
- player_character: PC information

You can also create NEW types if none of these fit well.`

interface EntityMention {
  name: string
  type: string
  aliases: string[]
  description: string
  confidence: number
}

interface RelationshipMention {
  sourceEntity: string
  targetEntity: string
  relationshipType: string
  reverseLabel?: string
  excerpt: string
}

// Parse extraction response with error recovery
function parseExtractionResponse(responseText: string, chunkIndex: number): {
  entities: EntityMention[]
  relationships: RelationshipMention[]
} {
  try {
    let jsonStr = responseText.trim()

    // Extract JSON from code blocks or raw
    const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    } else {
      const objMatch = jsonStr.match(/\{[\s\S]*/)
      if (objMatch) {
        jsonStr = objMatch[0]
      }
    }

    // Try to parse, with repair if needed
    let result: any
    try {
      result = JSON.parse(jsonStr)
    } catch {
      console.log(`[Extract-Chunk] Chunk ${chunkIndex + 1}: Attempting JSON repair...`)
      const repaired = repairTruncatedJson(jsonStr)
      result = JSON.parse(repaired)
    }

    return {
      entities: (result.entities || []).filter((e: any) => e.name && e.type),
      relationships: (result.relationships || []).filter((r: any) => r.sourceEntity && r.targetEntity),
    }
  } catch (error) {
    console.error(`[Extract-Chunk] Chunk ${chunkIndex + 1} parsing error:`, error)
    // Try regex extraction as fallback
    return extractPartialEntities(responseText)
  }
}

// Repair truncated JSON
function repairTruncatedJson(jsonStr: string): string {
  let str = jsonStr.trim()

  str = str.replace(/,\s*"[^"]*"?\s*:\s*"[^"]*$/, '')
  str = str.replace(/,\s*"[^"]*$/, '')

  let openBraces = 0
  let openBrackets = 0
  let inString = false
  let escape = false

  for (let i = 0; i < str.length; i++) {
    const char = str[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\' && inString) {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') openBraces++
      else if (char === '}') openBraces--
      else if (char === '[') openBrackets++
      else if (char === ']') openBrackets--
    }
  }

  if (inString) str += '"'
  str = str.replace(/,\s*$/, '')

  while (openBrackets > 0) {
    str += ']'
    openBrackets--
  }
  while (openBraces > 0) {
    str += '}'
    openBraces--
  }

  return str
}

// Extract entities from partial JSON using regex
function extractPartialEntities(text: string): {
  entities: EntityMention[]
  relationships: RelationshipMention[]
} {
  const entities: EntityMention[] = []

  const entityPattern = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"([^"]+)"[^}]*(?:"aliases"\s*:\s*\[([^\]]*)\][^}]*)?(?:"description"\s*:\s*"([^"]*)"[^}]*)?(?:"confidence"\s*:\s*([\d.]+)[^}]*)?\}/g

  let match
  while ((match = entityPattern.exec(text)) !== null) {
    const name = match[1]
    const type = match[2]
    const aliasesStr = match[3] || ''
    const description = match[4] || ''
    const confidence = parseFloat(match[5]) || 0.7

    const aliases: string[] = []
    const aliasMatches = aliasesStr.match(/"([^"]+)"/g)
    if (aliasMatches) {
      for (const a of aliasMatches) {
        aliases.push(a.replace(/"/g, ''))
      }
    }

    if (name && type) {
      entities.push({ name, type, aliases, description, confidence })
    }
  }

  return { entities, relationships: [] }
}
