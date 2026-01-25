import { generateSimple } from '@/lib/ai/client'
import type { AIModel, FactSection } from '@/lib/db/schema'

export interface ExtractedFact {
  subject: string
  subjectType: string
  fact: string
  section: FactSection
  sourceExcerpt: string
  isDmOnly: boolean
  confidence: number
  mentions: Array<{
    name: string
    type: string
    relationship?: string
  }>
}

export interface FactExtractionResult {
  facts: ExtractedFact[]
  newEntities: Array<{
    name: string
    type: string
    canonicalName: string
  }>
}

const FACT_EXTRACTION_PROMPT = `You are extracting FACTS from RPG campaign notes. Extract atomic facts about named entities.

RULES:
1. Each fact should be ONE piece of information (not multiple facts combined)
2. Subject must be a specific named entity (not "the guard" or "a tavern" - must have a name)
3. Include the exact quote from the text that supports this fact
4. Categorize into sections: appearance, personality, history, abilities, possessions, relationships, location, goals, secrets, other
5. Note any other named entities mentioned in the fact
6. If a fact implies a relationship, specify the type (enemy_of, ally_of, member_of, lives_in, owns, created, located_in, etc.)
7. Mark facts as isDmOnly if they contain secrets players shouldn't know
8. Confidence: 1.0 for explicit facts, 0.7-0.9 for implied facts, 0.5-0.7 for uncertain

ENTITY TYPES: npc, location, item, lore, quest, faction, session, player_character, creature, spell, event, organization, artifact, region, deity, race, class, ability, condition, material

EXISTING ENTITIES IN THIS CAMPAIGN (use exact names if referring to these):
{existingEntities}

INPUT TEXT:
{chunk}

OUTPUT FORMAT (JSON array only, no markdown):
[
  {
    "subject": "Entity Name",
    "subjectType": "npc",
    "fact": "single atomic fact about the subject",
    "section": "history",
    "sourceExcerpt": "exact quote from text",
    "isDmOnly": false,
    "confidence": 0.95,
    "mentions": [
      {"name": "Other Entity", "type": "creature", "relationship": "enemy_of"}
    ]
  }
]

Extract ALL facts. Every piece of information about a named entity should become a fact.`

/**
 * Extract facts from a chunk of text
 */
export async function extractFactsFromChunk(
  chunk: string,
  existingEntityNames: string[],
  model: AIModel = 'claude-3-5-haiku-20241022',
  language: string = 'en'
): Promise<ExtractedFact[]> {
  const languageNote = language !== 'en'
    ? `\n\nIMPORTANT: The content is in ${getLanguageName(language)}. Extract entity names as they appear in the original language.`
    : ''

  const prompt = FACT_EXTRACTION_PROMPT
    .replace('{existingEntities}', existingEntityNames.length > 0
      ? existingEntityNames.join(', ')
      : '(none yet)')
    .replace('{chunk}', chunk)
    + languageNote

  const response = await generateSimple(model, prompt, chunk, 2048)

  if (!response) {
    return []
  }

  return parseFactsResponse(response)
}

/**
 * Parse the AI response into structured facts
 */
function parseFactsResponse(response: string): ExtractedFact[] {
  let jsonStr = response.trim()

  // Extract JSON from code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  } else {
    // Try to find array start
    const arrayMatch = jsonStr.match(/\[[\s\S]*/)
    if (arrayMatch) {
      jsonStr = arrayMatch[0]
    }
  }

  // Try direct parse
  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) {
      return validateFacts(parsed)
    }
    return []
  } catch {
    // Try to repair truncated JSON
    try {
      const repaired = repairTruncatedJson(jsonStr)
      const parsed = JSON.parse(repaired)
      if (Array.isArray(parsed)) {
        return validateFacts(parsed)
      }
    } catch {
      console.error('[FactExtraction] Failed to parse response')
    }
  }

  return []
}

/**
 * Validate and clean up extracted facts
 */
function validateFacts(facts: any[]): ExtractedFact[] {
  return facts
    .filter((f) => f.subject && f.fact && f.section)
    .map((f) => ({
      subject: String(f.subject).trim(),
      subjectType: String(f.subjectType || 'npc').toLowerCase(),
      fact: String(f.fact).trim(),
      section: validateSection(f.section),
      sourceExcerpt: String(f.sourceExcerpt || '').trim(),
      isDmOnly: Boolean(f.isDmOnly),
      confidence: parseFloat(f.confidence) || 0.8,
      mentions: Array.isArray(f.mentions)
        ? f.mentions
            .filter((m: any) => m.name)
            .map((m: any) => ({
              name: String(m.name).trim(),
              type: String(m.type || 'npc').toLowerCase(),
              relationship: m.relationship ? String(m.relationship).toLowerCase() : undefined,
            }))
        : [],
    }))
}

function validateSection(section: string): FactSection {
  const valid: FactSection[] = [
    'appearance', 'personality', 'history', 'abilities', 'possessions',
    'relationships', 'location', 'goals', 'secrets', 'other'
  ]
  const s = String(section).toLowerCase() as FactSection
  return valid.includes(s) ? s : 'other'
}

/**
 * Repair truncated JSON array
 */
function repairTruncatedJson(jsonStr: string): string {
  let str = jsonStr.trim()

  // Remove trailing incomplete object properties
  str = str.replace(/,\s*"[^"]*"?\s*:\s*"?[^"]*$/, '')
  str = str.replace(/,\s*"[^"]*$/, '')
  str = str.replace(/,\s*\{[^}]*$/, '')

  // Count brackets
  let openBrackets = 0
  let openBraces = 0
  let inString = false
  let escape = false

  for (const char of str) {
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
      if (char === '[') openBrackets++
      else if (char === ']') openBrackets--
      else if (char === '{') openBraces++
      else if (char === '}') openBraces--
    }
  }

  // Close unclosed strings
  if (inString) str += '"'

  // Remove trailing comma
  str = str.replace(/,\s*$/, '')

  // Close unclosed braces and brackets
  while (openBraces > 0) {
    str += '}'
    openBraces--
  }
  while (openBrackets > 0) {
    str += ']'
    openBrackets--
  }

  return str
}

function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    pt: 'Portuguese',
    'pt-BR': 'Brazilian Portuguese',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
  }
  return languages[code] || code
}

/**
 * Group facts by subject and identify new entities
 */
export function groupFactsBySubject(
  facts: ExtractedFact[],
  existingEntityNames: Set<string>
): {
  bySubject: Map<string, ExtractedFact[]>
  newSubjects: Array<{ name: string; type: string; canonicalName: string }>
} {
  const bySubject = new Map<string, ExtractedFact[]>()
  const newSubjects: Array<{ name: string; type: string; canonicalName: string }> = []
  const seenNewSubjects = new Set<string>()

  for (const fact of facts) {
    const canonical = toCanonicalName(fact.subject)

    // Group facts
    if (!bySubject.has(canonical)) {
      bySubject.set(canonical, [])
    }
    bySubject.get(canonical)!.push(fact)

    // Track new entities
    if (!existingEntityNames.has(canonical) && !seenNewSubjects.has(canonical)) {
      seenNewSubjects.add(canonical)
      newSubjects.push({
        name: fact.subject,
        type: fact.subjectType,
        canonicalName: canonical,
      })
    }

    // Also track mentioned entities
    for (const mention of fact.mentions) {
      const mentionCanonical = toCanonicalName(mention.name)
      if (!existingEntityNames.has(mentionCanonical) && !seenNewSubjects.has(mentionCanonical)) {
        seenNewSubjects.add(mentionCanonical)
        newSubjects.push({
          name: mention.name,
          type: mention.type,
          canonicalName: mentionCanonical,
        })
      }
    }
  }

  return { bySubject, newSubjects }
}

function toCanonicalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Deduplicate facts (from overlapping chunks)
 */
export function deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const seen = new Map<string, ExtractedFact>()

  for (const fact of facts) {
    const key = `${toCanonicalName(fact.subject)}:${fact.section}:${fact.fact.toLowerCase().slice(0, 50)}`

    if (!seen.has(key)) {
      seen.set(key, fact)
    } else {
      // Keep higher confidence version
      const existing = seen.get(key)!
      if (fact.confidence > existing.confidence) {
        seen.set(key, fact)
      }
    }
  }

  return Array.from(seen.values())
}
