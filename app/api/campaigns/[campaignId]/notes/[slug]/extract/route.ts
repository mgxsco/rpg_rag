import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, notes, campaigns, campaignMembers, entities, relationships, entitySources, documents } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { runExtractionPipeline, ExtractionSettings } from '@/lib/ai/extraction/pipeline'
import { findExistingEntity, getExistingEntityNames, mergeAliases } from '@/lib/ai/extraction/dedup'
import { getCampaignSettings } from '@/lib/campaign-settings'

/**
 * Extract entities from a note
 * POST /api/campaigns/{campaignId}/notes/{slug}/extract
 */
export async function POST(
  request: Request,
  { params }: { params: { campaignId: string; slug: string } }
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

  // Get the note
  const note = await db.query.notes.findFirst({
    where: and(
      eq(notes.campaignId, params.campaignId),
      eq(notes.slug, params.slug)
    ),
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  if (!note.content || note.content.trim().length === 0) {
    return NextResponse.json({ error: 'Note has no content to extract' }, { status: 400 })
  }

  try {
    // Create a document record to track the extraction source
    const [doc] = await db
      .insert(documents)
      .values({
        campaignId: params.campaignId,
        name: `Note: ${note.title}`,
        content: note.content,
        fileType: 'text/markdown',
        uploadedBy: session.user.id,
      })
      .returning()

    // Get existing entity names for deduplication
    const existingNames = await getExistingEntityNames(params.campaignId)

    // Get campaign settings for extraction
    const language = (campaign as any).language || 'pt-BR'
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
    console.log(`[Notes] Running extraction pipeline for note: ${note.title} (language: ${language})`)
    const extraction = await runExtractionPipeline(
      note.content,
      note.title,
      existingNames,
      language,
      undefined,
      extractionSettings
    )

    // Create or update entities
    const createdEntities = []
    const entityIdMap = new Map<string, string>()
    const defaultDmOnly = campaignSettings.visibility.defaultDmOnly

    for (const extracted of extraction.entities) {
      try {
        // Check for existing entity
        const existing = await findExistingEntity(
          params.campaignId,
          extracted.name,
          extracted.aliases
        )

        if (existing) {
          // Update existing entity with new aliases and source
          console.log(`[Notes] Found existing entity: ${existing.name}`)
          await mergeAliases(existing.id, extracted.aliases)

          // Add source reference
          await db
            .insert(entitySources)
            .values({
              entityId: existing.id,
              documentId: doc.id,
              excerpt: extracted.content.slice(0, 500),
              confidence: '0.9',
            })
            .onConflictDoNothing()

          entityIdMap.set(extracted.name.toLowerCase(), existing.id)
          continue
        }

        // Create new entity
        console.log(`[Notes] Creating entity: ${extracted.name}`)
        const [newEntity] = await db
          .insert(entities)
          .values({
            campaignId: params.campaignId,
            name: extracted.name,
            canonicalName: extracted.canonicalName,
            entityType: extracted.type,
            content: extracted.content,
            aliases: extracted.aliases,
            tags: extracted.tags,
            isDmOnly: defaultDmOnly || note.isDmOnly,
            sourceNoteId: note.id,
          })
          .returning()

        entityIdMap.set(extracted.name.toLowerCase(), newEntity.id)

        // Add source reference
        await db.insert(entitySources).values({
          entityId: newEntity.id,
          documentId: doc.id,
          excerpt: extracted.content.slice(0, 500),
          confidence: '1.0',
        })

        createdEntities.push({
          id: newEntity.id,
          name: newEntity.name,
          type: newEntity.entityType,
        })
      } catch (entityError) {
        console.error(`[Notes] Failed to create entity ${extracted.name}:`, entityError)
      }
    }

    // Create relationships
    const createdRelationships = []

    for (const rel of extraction.relationships) {
      try {
        let sourceId = entityIdMap.get(rel.sourceEntity.toLowerCase())
        let targetId = entityIdMap.get(rel.targetEntity.toLowerCase())

        // Try to find in database if not in map
        if (!sourceId) {
          const sourceEntity = await findExistingEntity(params.campaignId, rel.sourceEntity, [])
          if (sourceEntity) sourceId = sourceEntity.id
        }
        if (!targetId) {
          const targetEntity = await findExistingEntity(params.campaignId, rel.targetEntity, [])
          if (targetEntity) targetId = targetEntity.id
        }

        if (!sourceId || !targetId) {
          continue
        }

        // Create relationship
        await db
          .insert(relationships)
          .values({
            campaignId: params.campaignId,
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            relationshipType: rel.relationshipType,
            reverseLabel: rel.reverseLabel,
            documentId: doc.id,
          })
          .onConflictDoNothing()

        createdRelationships.push({
          source: rel.sourceEntity,
          target: rel.targetEntity,
          type: rel.relationshipType,
        })
      } catch (relError) {
        console.error(`[Notes] Failed to create relationship:`, relError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Extracted ${createdEntities.length} entities and ${createdRelationships.length} relationships from note "${note.title}"`,
      entitiesCreated: createdEntities.length,
      entities: createdEntities,
      relationshipsCreated: createdRelationships.length,
      relationships: createdRelationships,
    })
  } catch (error) {
    console.error('[Notes] Extraction error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
