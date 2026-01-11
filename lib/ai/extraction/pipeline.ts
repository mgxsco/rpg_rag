import Anthropic from '@anthropic-ai/sdk'
import { EntityType } from '@/lib/db/schema'

// ============================================
// Types
// ============================================

export interface EntityMention {
  name: string
  type: EntityType
  aliases: string[]
  description: string
  confidence: number
}

export interface RelationshipMention {
  sourceEntity: string
  targetEntity: string
  relationshipType: string
  reverseLabel?: string
  excerpt: string
}

export interface ExtractedEntity {
  name: string
  canonicalName: string
  type: EntityType
  content: string
  aliases: string[]
  tags: string[]
  relationships: RelationshipMention[]
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relationships: RelationshipMention[]
  documentSummary: string
}

// ============================================
// Anthropic Client
// ============================================

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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
    nl: 'Dutch',
    pl: 'Polish',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
  }
  return languages[code] || code
}

// ============================================
// Chunk document into smaller pieces
// ============================================

function chunkDocument(content: string, maxChunkSize: number = 4000): string[] {
  const chunks: string[] = []

  // Try to split on paragraph breaks
  const paragraphs = content.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = para
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  // If we still have chunks that are too large, split them further
  const finalChunks: string[] = []
  for (const chunk of chunks) {
    if (chunk.length > maxChunkSize) {
      // Split by sentences
      const sentences = chunk.split(/(?<=[.!?])\s+/)
      let subChunk = ''
      for (const sentence of sentences) {
        if (subChunk.length + sentence.length > maxChunkSize && subChunk.length > 0) {
          finalChunks.push(subChunk.trim())
          subChunk = sentence
        } else {
          subChunk += (subChunk ? ' ' : '') + sentence
        }
      }
      if (subChunk.trim()) {
        finalChunks.push(subChunk.trim())
      }
    } else {
      finalChunks.push(chunk)
    }
  }

  return finalChunks.length > 0 ? finalChunks : [content.slice(0, maxChunkSize)]
}

// ============================================
// Fast Entity + Relationship Extraction (Single Haiku call per chunk)
// ============================================

interface ChunkExtraction {
  entities: EntityMention[]
  relationships: RelationshipMention[]
}

async function extractFromChunk(
  content: string,
  chunkIndex: number,
  totalChunks: number,
  language: string = 'en'
): Promise<ChunkExtraction> {
  console.log(`[Extraction] Processing chunk ${chunkIndex + 1}/${totalChunks} (${content.length} chars, lang: ${language})`)

  const anthropic = getAnthropicClient()

  const languageInstruction = language !== 'en'
    ? `IMPORTANT: The content is in ${getLanguageName(language)}. Extract entity names as they appear in the original language, but you may provide descriptions in ${getLanguageName(language)} as well.`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 8192,
    system: `You are an OBSESSIVE wiki curator. Extract ABSOLUTELY EVERYTHING from this RPG/D&D content. Miss NOTHING.
${languageInstruction}

EXTRACT THESE AS ENTITIES:

NPCs - Extract ALL of these:
- Named characters (Gandalf, Lord Vex, Captain Maya)
- Unnamed but titled characters ("the old wizard", "the bartender" → create name like "The Old Wizard")
- Characters only mentioned ("my father", "the king who died" → "Father of [Character]", "The Dead King")
- Gods, demons, spirits, ghosts
- Ancestors, historical figures
- Anyone spoken about in dialogue

LOCATIONS - Extract ALL of these:
- Cities, towns, villages
- Buildings (taverns, temples, shops, houses)
- Rooms within buildings
- Dungeons, caves, ruins
- Geographic features (mountains, rivers, forests)
- Regions, kingdoms, continents
- Planes of existence
- Places only mentioned ("the city where I was born" → create entry)

ITEMS - Extract ALL of these:
- Weapons (swords, bows, magical staves)
- Armor and clothing
- Potions, scrolls, books
- Keys, tools, mundane objects if named
- Artifacts and relics
- Vehicles, mounts
- Currency types if named
- Food/drink if named

FACTIONS - Extract ALL of these:
- Guilds, orders, organizations
- Armies, militias
- Cults, religions
- Families, clans, dynasties
- Species/races (Elves, Dwarves, Goblins)
- Monster types as groups
- Political parties

LORE - Extract ALL of these:
- Historical events ("The Great War", "The Sundering")
- Prophecies, legends
- Calendar systems, holidays
- Customs, traditions
- Magic systems or schools
- Languages mentioned

QUESTS - Extract ALL of these:
- Main objectives
- Side missions
- Rumors of tasks
- Bounties, contracts
- Personal goals mentioned

FREEFORM - Extract ALL of these:
- Spells by name
- Abilities, skills
- Titles, epithets
- Concepts unique to the world
- Diseases, curses
- Materials (mithril, dragonscale)

EXAMPLE - From "The party met Grok at the Rusty Nail tavern in Millbrook. He mentioned his brother was killed by the Shadow Guild."
Extract: Grok (npc), Rusty Nail (location), Millbrook (location), Grok's Brother (npc), Shadow Guild (faction), Murder of Grok's Brother (lore)

RELATIONSHIPS: lives_in, member_of, owns, created, enemy_of, ally_of, located_in, participated_in, mentioned_in, related_to, knows, serves, rules, guards, seeks, fears, loves, hates, works_for, parent_of, child_of, sibling_of, married_to, worships, leads, follows, created_by, contains, part_of, killed_by, visited, hired_by

Return ONLY valid JSON:
{
  "entities": [{
    "name": "Exact Name",
    "type": "npc|location|item|quest|faction|lore|session|player_character|freeform",
    "aliases": ["other names"],
    "description": "All known information (2-4 sentences)",
    "confidence": 0.5-1.0
  }],
  "relationships": [{
    "sourceEntity": "Name",
    "targetEntity": "Name",
    "relationshipType": "type",
    "reverseLabel": "reverse",
    "excerpt": "context"
  }]
}

CRITICAL: Extract 20-50+ entities from typical session notes. If you extract fewer than 10, you are missing things. Every noun could be an entity!`,
    messages: [{
      role: 'user',
      content: content,
    }],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return { entities: [], relationships: [] }
  }

  try {
    let jsonStr = textContent.text.trim()

    // Extract JSON from code blocks or raw
    const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    } else {
      const objMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (objMatch) {
        jsonStr = objMatch[0]
      }
    }

    const result = JSON.parse(jsonStr) as ChunkExtraction
    console.log(`[Extraction] Chunk ${chunkIndex + 1}: ${result.entities?.length || 0} entities, ${result.relationships?.length || 0} relationships`)

    return {
      entities: (result.entities || []).filter(e => e.name && e.type),
      relationships: (result.relationships || []).filter(r => r.sourceEntity && r.targetEntity),
    }
  } catch (error) {
    console.error(`[Extraction] Chunk ${chunkIndex + 1} parsing error:`, error)
    return { entities: [], relationships: [] }
  }
}

// ============================================
// Merge and deduplicate entities from all chunks
// ============================================

function mergeExtractions(
  extractions: ChunkExtraction[],
  existingEntityNames: string[]
): { entities: ExtractedEntity[], relationships: RelationshipMention[] } {
  const entityMentionMap = new Map<string, EntityMention>()
  const allRelationships: RelationshipMention[] = []
  const existingNamesLower = new Set(existingEntityNames.map(n => n.toLowerCase()))

  // First pass: collect all entity mentions
  for (const extraction of extractions) {
    for (const mention of extraction.entities) {
      const key = mention.name.toLowerCase()

      // Skip if already exists in campaign
      const canonicalName = mention.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (existingNamesLower.has(key) || existingNamesLower.has(canonicalName)) {
        continue
      }

      if (entityMentionMap.has(key)) {
        // Merge with existing mention
        const existing = entityMentionMap.get(key)!
        // Add new aliases
        for (const alias of mention.aliases || []) {
          if (!existing.aliases.includes(alias)) {
            existing.aliases.push(alias)
          }
        }
        // Combine descriptions
        if (mention.description && !existing.description.includes(mention.description)) {
          existing.description += ' ' + mention.description
        }
      } else {
        entityMentionMap.set(key, { ...mention, aliases: mention.aliases || [] })
      }
    }

    // Collect relationships
    allRelationships.push(...extraction.relationships)
  }

  // Deduplicate relationships
  const relationshipKeys = new Set<string>()
  const uniqueRelationships = allRelationships.filter(r => {
    const key = `${r.sourceEntity.toLowerCase()}-${r.relationshipType}-${r.targetEntity.toLowerCase()}`
    if (relationshipKeys.has(key)) return false
    relationshipKeys.add(key)
    return true
  })

  // Build all entity names set for wikilinks
  const allEntityNames = new Set<string>()
  for (const mention of entityMentionMap.values()) {
    allEntityNames.add(mention.name)
  }
  // Also include existing entities for wikilink detection
  for (const name of existingEntityNames) {
    allEntityNames.add(name)
  }

  // Second pass: generate wiki content with relationships and wikilinks
  const entities: ExtractedEntity[] = []
  for (const [key, mention] of entityMentionMap) {
    const canonicalName = mention.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    // Get relationships for this entity
    const outgoingRelationships: EntityRelationship[] = uniqueRelationships
      .filter(r => r.sourceEntity.toLowerCase() === key)
      .map(r => ({
        targetName: r.targetEntity,
        type: r.relationshipType,
        reverseLabel: r.reverseLabel,
        excerpt: r.excerpt,
      }))

    const incomingRelationships: EntityRelationship[] = uniqueRelationships
      .filter(r => r.targetEntity.toLowerCase() === key)
      .map(r => ({
        targetName: r.sourceEntity,
        type: r.relationshipType,
        reverseLabel: r.reverseLabel,
        excerpt: r.excerpt,
      }))

    // Generate wiki content with wikilinks
    const wikiContent = generateWikiContent(
      mention,
      outgoingRelationships,
      incomingRelationships,
      allEntityNames
    )

    entities.push({
      name: mention.name,
      canonicalName,
      type: mention.type,
      content: wikiContent,
      aliases: mention.aliases,
      tags: [mention.type],
      relationships: outgoingRelationships.map(r => ({
        sourceEntity: mention.name,
        targetEntity: r.targetName,
        relationshipType: r.type,
        reverseLabel: r.reverseLabel,
        excerpt: r.excerpt || '',
      })),
    })
  }

  return {
    entities,
    relationships: uniqueRelationships,
  }
}

// ============================================
// Generate detailed wiki content with [[wikilinks]]
// ============================================

interface EntityRelationship {
  targetName: string
  type: string
  reverseLabel?: string
  excerpt?: string
}

function generateWikiContent(
  mention: EntityMention,
  outgoingRelationships: EntityRelationship[],
  incomingRelationships: EntityRelationship[],
  allEntityNames: Set<string>
): string {
  const typeLabels: Record<string, string> = {
    npc: 'Character',
    location: 'Location',
    item: 'Item',
    quest: 'Quest',
    faction: 'Faction',
    lore: 'Lore',
    session: 'Session',
    player_character: 'Player Character',
    freeform: 'Entry',
  }

  const relationshipLabels: Record<string, string> = {
    lives_in: 'Lives in',
    member_of: 'Member of',
    owns: 'Owns',
    created: 'Created',
    enemy_of: 'Enemy of',
    ally_of: 'Ally of',
    located_in: 'Located in',
    participated_in: 'Participated in',
    mentioned_in: 'Mentioned in',
    related_to: 'Related to',
    knows: 'Knows',
    serves: 'Serves',
    rules: 'Rules over',
    guards: 'Guards',
    seeks: 'Seeks',
    fears: 'Fears',
    loves: 'Loves',
    hates: 'Hates',
    works_for: 'Works for',
    parent_of: 'Parent of',
    child_of: 'Child of',
    sibling_of: 'Sibling of',
    married_to: 'Married to',
    worships: 'Worships',
    leads: 'Leads',
    follows: 'Follows',
    created_by: 'Created by',
    contains: 'Contains',
    part_of: 'Part of',
    killed_by: 'Killed by',
    visited: 'Visited',
    hired_by: 'Hired by',
  }

  const label = typeLabels[mention.type] || 'Entry'

  // Convert description to include [[wikilinks]] for known entities
  let description = mention.description || `A ${label.toLowerCase()} mentioned in the campaign.`

  // Replace entity names with wikilinks (case-insensitive, whole word)
  for (const entityName of allEntityNames) {
    if (entityName.toLowerCase() !== mention.name.toLowerCase()) {
      // Match whole words, case-insensitive
      const escapedName = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escapedName}\\b(?![\\]\\]])`, 'gi')
      description = description.replace(regex, `[[${entityName}]]`)
    }
  }

  let content = `# ${mention.name}\n\n`

  if (mention.aliases && mention.aliases.length > 0) {
    content += `*Also known as: ${mention.aliases.join(', ')}*\n\n`
  }

  content += description + '\n\n'

  // Add outgoing relationships as wiki links in prose
  if (outgoingRelationships.length > 0) {
    content += `## Connections\n\n`

    // Group relationships by type
    const groupedRels: Record<string, string[]> = {}
    for (const rel of outgoingRelationships) {
      const relLabel = relationshipLabels[rel.type] || rel.type.replace(/_/g, ' ')
      if (!groupedRels[relLabel]) {
        groupedRels[relLabel] = []
      }
      groupedRels[relLabel].push(`[[${rel.targetName}]]`)
    }

    for (const [relType, targets] of Object.entries(groupedRels)) {
      content += `- **${relType}:** ${targets.join(', ')}\n`
    }
    content += '\n'
  }

  // Add incoming relationships (backlinks)
  if (incomingRelationships.length > 0) {
    const uniqueBacklinks = [...new Set(incomingRelationships.map(r => r.targetName))]
    if (uniqueBacklinks.length > 0) {
      content += `## Mentioned By\n\n`
      content += uniqueBacklinks.map(name => `- [[${name}]]`).join('\n')
      content += '\n'
    }
  }

  return content
}

// ============================================
// Full Extraction Pipeline (Fast version)
// ============================================

export interface ExtractionProgress {
  stage: string
  current: number
  total: number
  message: string
}

export async function runExtractionPipeline(
  content: string,
  fileName: string,
  existingEntityNames: string[] = [],
  language: string = 'en',
  onProgress?: (progress: ExtractionProgress) => void
): Promise<ExtractionResult> {
  console.log(`[Extraction] Starting fast pipeline for ${fileName}`)
  console.log(`[Extraction] Content length: ${content.length} chars, language: ${language}`)
  console.log(`[Extraction] Existing entities: ${existingEntityNames.length}`)

  // Chunk the document (smaller chunks = more detailed extraction)
  const chunks = chunkDocument(content, 4000)
  console.log(`[Extraction] Split into ${chunks.length} chunks`)

  onProgress?.({
    stage: 'chunking',
    current: 0,
    total: chunks.length,
    message: `Split document into ${chunks.length} chunks`
  })

  // Process chunks (sequentially to avoid rate limits, but faster than before)
  const extractions: ChunkExtraction[] = []

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({
      stage: 'extracting',
      current: i + 1,
      total: chunks.length,
      message: `Extracting entities from chunk ${i + 1}/${chunks.length}`
    })

    try {
      const extraction = await extractFromChunk(chunks[i], i, chunks.length, language)
      extractions.push(extraction)
    } catch (error) {
      console.error(`[Extraction] Failed to process chunk ${i + 1}:`, error)
      extractions.push({ entities: [], relationships: [] })
    }
  }

  // Merge and deduplicate
  const { entities, relationships } = mergeExtractions(extractions, existingEntityNames)

  console.log(`[Extraction] Pipeline complete: ${entities.length} entities, ${relationships.length} relationships`)

  return {
    entities,
    relationships,
    documentSummary: `Extracted ${entities.length} entities and ${relationships.length} relationships from ${fileName}`,
  }
}

// ============================================
// Legacy exports for compatibility
// ============================================

export async function extractEntities(content: string, fileName: string): Promise<EntityMention[]> {
  const result = await extractFromChunk(content.slice(0, 8000), 0, 1)
  return result.entities
}

export async function extractRelationships(content: string, entities: EntityMention[]): Promise<RelationshipMention[]> {
  const result = await extractFromChunk(content.slice(0, 8000), 0, 1)
  return result.relationships
}
