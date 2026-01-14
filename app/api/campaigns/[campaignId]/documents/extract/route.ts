import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, entities } from '@/lib/db'
import { eq, and, or, ilike } from 'drizzle-orm'
import { runExtractionPipeline, ExtractionSettings } from '@/lib/ai/extraction/pipeline'
import { getExistingEntityNames } from '@/lib/ai/extraction/dedup'
import { getCampaignSettings } from '@/lib/campaign-settings'
import { v4 as uuidv4 } from 'uuid'
import type { StagedEntity, StagedRelationship, EntityMatch, ExtractPreviewResponse } from '@/lib/types'

// Dynamic import for pdf-parse
async function parsePDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

/**
 * Extract entities from document WITHOUT committing to database
 * POST /api/campaigns/{campaignId}/documents/extract
 *
 * Returns preview data for review UI
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!membership && campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileName = file.name
    const fileType = file.type
    const buffer = Buffer.from(await file.arrayBuffer())

    // Parse file content
    let content = ''
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      content = await parsePDF(buffer)
    } else if (
      fileType === 'text/plain' ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileType === 'text/markdown'
    ) {
      content = buffer.toString('utf-8')
    } else if (fileType === 'application/json' || fileName.endsWith('.json')) {
      const json = JSON.parse(buffer.toString('utf-8'))
      content = JSON.stringify(json, null, 2)
    } else {
      try {
        content = buffer.toString('utf-8')
      } catch {
        return NextResponse.json(
          { error: `Unsupported file type: ${fileType}` },
          { status: 400 }
        )
      }
    }

    content = content.trim()

    if (!content) {
      return NextResponse.json(
        { error: 'No content extracted from file' },
        { status: 400 }
      )
    }

    // Get language from campaign settings
    const language = (campaign as any).language || 'en'

    // Get existing entity names for deduplication
    const existingNames = await getExistingEntityNames(params.campaignId)

    // Get campaign settings for extraction
    const campaignSettings = getCampaignSettings((campaign as any).settings)
    const extractionSettings: ExtractionSettings = {
      chunkSize: campaignSettings.extraction.chunkSize,
      aggressiveness: campaignSettings.extraction.aggressiveness,
      confidenceThreshold: campaignSettings.extraction.confidenceThreshold,
      enableRelationships: campaignSettings.extraction.enableRelationships,
      customPrompts: {
        extractionConservativePrompt: campaignSettings.prompts.extractionConservativePrompt,
        extractionBalancedPrompt: campaignSettings.prompts.extractionBalancedPrompt,
        extractionObsessivePrompt: campaignSettings.prompts.extractionObsessivePrompt,
      },
    }

    // Run extraction pipeline
    const extraction = await runExtractionPipeline(
      content,
      fileName,
      existingNames,
      language,
      undefined,
      extractionSettings
    )

    // Convert extracted entities to staged entities with tempIds
    const stagedEntities: StagedEntity[] = extraction.entities.map((entity) => ({
      tempId: uuidv4(),
      name: entity.name,
      canonicalName: entity.canonicalName,
      entityType: entity.type,
      content: entity.content,
      aliases: entity.aliases,
      tags: entity.tags,
      confidence: 0.8, // Default confidence
      excerpt: entity.content.slice(0, 300),
      status: 'pending' as const,
    }))

    // Create tempId lookup for relationships
    const nameToTempId = new Map<string, string>()
    stagedEntities.forEach((e) => {
      nameToTempId.set(e.name.toLowerCase(), e.tempId)
      e.aliases.forEach((alias) => nameToTempId.set(alias.toLowerCase(), e.tempId))
    })

    // Convert relationships to staged relationships
    const stagedRelationships: StagedRelationship[] = []
    for (const rel of extraction.relationships) {
      const sourceTempId = nameToTempId.get(rel.sourceEntity.toLowerCase())
      const targetTempId = nameToTempId.get(rel.targetEntity.toLowerCase())

      // Only include relationships where both entities are in our staged list
      if (!sourceTempId || !targetTempId) {
        continue
      }

      stagedRelationships.push({
        tempId: uuidv4(),
        sourceEntityTempId: sourceTempId,
        targetEntityTempId: targetTempId,
        sourceEntityName: rel.sourceEntity,
        targetEntityName: rel.targetEntity,
        relationshipType: rel.relationshipType,
        reverseLabel: rel.reverseLabel,
        excerpt: rel.excerpt || '',
        status: 'pending' as const,
      })
    }

    // Find existing entity matches for duplicates
    const existingEntityMatches: EntityMatch[] = []

    for (const staged of stagedEntities) {
      // Check for exact name match
      const exactMatch = await db.query.entities.findFirst({
        where: and(
          eq(entities.campaignId, params.campaignId),
          ilike(entities.canonicalName, staged.canonicalName)
        ),
        columns: {
          id: true,
          name: true,
          entityType: true,
          aliases: true,
          canonicalName: true,
        },
      })

      if (exactMatch) {
        existingEntityMatches.push({
          stagedTempId: staged.tempId,
          existingEntity: {
            id: exactMatch.id,
            name: exactMatch.name,
            entityType: exactMatch.entityType,
            aliases: exactMatch.aliases || [],
            canonicalName: exactMatch.canonicalName,
          },
          matchType: 'exact',
          confidence: 1.0,
        })
        continue
      }

      // Check for alias match
      for (const alias of staged.aliases) {
        const aliasCanonical = alias
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        const aliasMatch = await db.query.entities.findFirst({
          where: and(
            eq(entities.campaignId, params.campaignId),
            ilike(entities.canonicalName, aliasCanonical)
          ),
          columns: {
            id: true,
            name: true,
            entityType: true,
            aliases: true,
            canonicalName: true,
          },
        })

        if (aliasMatch) {
          existingEntityMatches.push({
            stagedTempId: staged.tempId,
            existingEntity: {
              id: aliasMatch.id,
              name: aliasMatch.name,
              entityType: aliasMatch.entityType,
              aliases: aliasMatch.aliases || [],
              canonicalName: aliasMatch.canonicalName,
            },
            matchType: 'alias',
            confidence: 0.8,
          })
          break
        }
      }
    }

    const response: ExtractPreviewResponse = {
      success: true,
      documentId: uuidv4(), // Temporary ID for tracking
      fileName,
      extractedEntities: stagedEntities,
      extractedRelationships: stagedRelationships,
      existingEntityMatches,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Documents/Extract] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
