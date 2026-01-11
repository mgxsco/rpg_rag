import Anthropic from '@anthropic-ai/sdk'
import { EntityType } from '@/lib/db/schema'

// ============================================
// Types
// ============================================

export interface EntityMention {
  name: string
  type: EntityType
  aliases: string[]
  firstMention: string // Excerpt where first mentioned
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

// ============================================
// Pass 1: Entity Extraction (Haiku - cheap)
// ============================================

export async function extractEntities(
  content: string,
  fileName: string
): Promise<EntityMention[]> {
  console.log('[Extraction] Pass 1: Extracting entities...')

  const anthropic = getAnthropicClient()

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4096,
    system: `You are analyzing D&D campaign content to extract all entities.

Extract EVERY named entity from the text. Be thorough - don't miss any characters, places, or items.

Entity types:
- npc: Named characters (NPCs, villains, allies, monsters with names)
- location: Places (cities, dungeons, taverns, regions, buildings)
- item: Magic items, artifacts, significant objects
- quest: Quests, missions, objectives
- faction: Organizations, guilds, groups, armies
- lore: Named legends, prophecies, historical events
- session: Session summaries (if this is session notes)
- player_character: Player characters
- freeform: Other important named things

Return ONLY valid JSON array:
[{
  "name": "Entity Name",
  "type": "npc|location|item|quest|faction|lore|session|player_character|freeform",
  "aliases": ["other names used"],
  "firstMention": "exact quote of first mention (max 100 chars)",
  "confidence": 0.0-1.0
}]

Be comprehensive. Extract ALL named entities.`,
    messages: [{
      role: 'user',
      content: `File: ${fileName}\n\n${content.slice(0, 40000)}`,
    }],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return []
  }

  try {
    let jsonStr = textContent.text.trim()
    const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    } else {
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
    }

    const entities = JSON.parse(jsonStr) as EntityMention[]
    console.log(`[Extraction] Pass 1 found ${entities.length} entities`)
    return entities.filter(e => e.name && e.type)
  } catch (error) {
    console.error('[Extraction] Pass 1 parsing error:', error)
    return []
  }
}

// ============================================
// Pass 2: Relationship Extraction (Haiku - cheap)
// ============================================

export async function extractRelationships(
  content: string,
  entities: EntityMention[]
): Promise<RelationshipMention[]> {
  if (entities.length < 2) {
    return []
  }

  console.log('[Extraction] Pass 2: Extracting relationships...')

  const anthropic = getAnthropicClient()
  const entityNames = entities.map(e => e.name).join(', ')

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4096,
    system: `You are analyzing D&D campaign content to extract relationships between entities.

Known entities: ${entityNames}

Relationship types (use these exact values):
- lives_in: Character lives in a location (reverse: "residents")
- member_of: Character is member of faction/group (reverse: "members")
- owns: Character owns an item (reverse: "owned_by")
- created: Character created an item (reverse: "created_by")
- enemy_of: Entities are enemies (reverse: "enemies")
- ally_of: Entities are allies (reverse: "allies")
- located_in: Location is within another location (reverse: "contains")
- participated_in: Entity participated in event/quest (reverse: "participants")
- mentioned_in: Entity mentioned in session/lore (reverse: "mentions")
- related_to: General relationship (reverse: "related")

Return ONLY valid JSON array:
[{
  "sourceEntity": "Entity Name",
  "targetEntity": "Other Entity Name",
  "relationshipType": "lives_in|member_of|owns|etc",
  "reverseLabel": "reverse label",
  "excerpt": "text showing relationship (max 100 chars)"
}]

Only include relationships you can infer from the text. Both entities must be in the known entities list.`,
    messages: [{
      role: 'user',
      content: content.slice(0, 40000),
    }],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return []
  }

  try {
    let jsonStr = textContent.text.trim()
    const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    } else {
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
    }

    const relationships = JSON.parse(jsonStr) as RelationshipMention[]
    console.log(`[Extraction] Pass 2 found ${relationships.length} relationships`)
    return relationships.filter(r => r.sourceEntity && r.targetEntity && r.relationshipType)
  } catch (error) {
    console.error('[Extraction] Pass 2 parsing error:', error)
    return []
  }
}

// ============================================
// Pass 3: Wiki Content Generation (Sonnet - detailed)
// ============================================

export async function generateEntityContent(
  entityMention: EntityMention,
  fullContext: string,
  relationships: RelationshipMention[],
  existingEntityNames: string[]
): Promise<ExtractedEntity | null> {
  console.log(`[Extraction] Pass 3: Generating content for ${entityMention.name}...`)

  const anthropic = getAnthropicClient()

  // Find relationships involving this entity
  const entityRelationships = relationships.filter(
    r => r.sourceEntity === entityMention.name || r.targetEntity === entityMention.name
  )

  // Build list of related entities for wikilinks
  const relatedEntities = new Set<string>()
  for (const r of entityRelationships) {
    if (r.sourceEntity !== entityMention.name) relatedEntities.add(r.sourceEntity)
    if (r.targetEntity !== entityMention.name) relatedEntities.add(r.targetEntity)
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are creating a wiki page for a D&D campaign entity.

Create a detailed, well-structured wiki page in markdown format.
Use [[Entity Name]] wikilink syntax to reference related entities.

Related entities to link: ${Array.from(relatedEntities).join(', ')}
Existing entities (can also link): ${existingEntityNames.slice(0, 50).join(', ')}

Structure guidelines by type:
- NPC: Description, personality, motivations, history, relationships
- Location: Description, notable features, inhabitants, history
- Item: Description, properties, history, current owner
- Quest: Objectives, rewards, challenges, involved NPCs/locations
- Faction: Goals, members, influence, headquarters
- Lore: The legend/history, significance, related events

Return ONLY valid JSON:
{
  "content": "markdown wiki content with [[wikilinks]]",
  "tags": ["relevant", "tags"]
}`,
    messages: [{
      role: 'user',
      content: `Create wiki page for:
Name: ${entityMention.name}
Type: ${entityMention.type}
Aliases: ${entityMention.aliases?.join(', ') || 'none'}

Known relationships:
${entityRelationships.map(r => `- ${r.sourceEntity} ${r.relationshipType} ${r.targetEntity}`).join('\n') || 'none found'}

Source context:
${fullContext.slice(0, 20000)}`,
    }],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return null
  }

  try {
    let jsonStr = textContent.text.trim()
    const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    const result = JSON.parse(jsonStr) as { content: string; tags: string[] }

    // Generate canonical name
    const canonicalName = entityMention.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    return {
      name: entityMention.name,
      canonicalName,
      type: entityMention.type,
      content: result.content,
      aliases: entityMention.aliases || [],
      tags: result.tags || [],
      relationships: entityRelationships,
    }
  } catch (error) {
    console.error(`[Extraction] Pass 3 parsing error for ${entityMention.name}:`, error)
    return null
  }
}

// ============================================
// Full Extraction Pipeline
// ============================================

export async function runExtractionPipeline(
  content: string,
  fileName: string,
  existingEntityNames: string[] = []
): Promise<ExtractionResult> {
  console.log(`[Extraction] Starting pipeline for ${fileName}`)
  console.log(`[Extraction] Content length: ${content.length} chars`)
  console.log(`[Extraction] Existing entities: ${existingEntityNames.length}`)

  // Pass 1: Extract entities
  const entityMentions = await extractEntities(content, fileName)

  if (entityMentions.length === 0) {
    console.log('[Extraction] No entities found')
    return {
      entities: [],
      relationships: [],
      documentSummary: `No entities extracted from ${fileName}`,
    }
  }

  // Pass 2: Extract relationships
  const relationships = await extractRelationships(content, entityMentions)

  // Pass 3: Generate content for new entities only
  const entities: ExtractedEntity[] = []
  const existingNamesLower = new Set(existingEntityNames.map(n => n.toLowerCase()))

  for (const mention of entityMentions) {
    // Skip if entity already exists
    const canonicalName = mention.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (existingNamesLower.has(mention.name.toLowerCase()) || existingNamesLower.has(canonicalName)) {
      console.log(`[Extraction] Skipping existing entity: ${mention.name}`)
      continue
    }

    // Generate content for new entities
    const entity = await generateEntityContent(
      mention,
      content,
      relationships,
      existingEntityNames
    )

    if (entity) {
      entities.push(entity)
    }
  }

  console.log(`[Extraction] Pipeline complete: ${entities.length} new entities, ${relationships.length} relationships`)

  return {
    entities,
    relationships,
    documentSummary: `Extracted ${entities.length} entities and ${relationships.length} relationships from ${fileName}`,
  }
}
