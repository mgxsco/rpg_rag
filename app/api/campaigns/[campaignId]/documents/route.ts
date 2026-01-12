import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, documents, entities, relationships, entitySources, CampaignSettings } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { runExtractionPipeline, ExtractionSettings } from '@/lib/ai/extraction/pipeline'
import { findExistingEntity, getExistingEntityNames, mergeAliases } from '@/lib/ai/extraction/dedup'
import { ensureKnowledgeGraphTables } from '@/lib/db/migrations'
import { getCampaignSettings } from '@/lib/campaign-settings'

// Dynamic import for pdf-parse
async function parsePDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

/**
 * Upload document and extract entities
 * POST /api/campaigns/{campaignId}/documents
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
    // Auto-migrate tables if needed
    const migration = await ensureKnowledgeGraphTables()
    if (migration.error) {
      return NextResponse.json(
        { error: 'Database setup failed', details: migration.error },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    // Get language from campaign settings
    const language = (campaign as any).language || 'en'

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const results = []
    const progress: string[] = []

    if (migration.migrated) {
      progress.push('Database tables created automatically')
    }

    progress.push(`Campaign language: ${language}`)

    for (const file of files) {
      const fileName = file.name
      progress.push(`Processing: ${fileName}`)
      const fileType = file.type
      const buffer = Buffer.from(await file.arrayBuffer())

      let content = ''

      // Parse based on file type
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
        // Try to read as text
        try {
          content = buffer.toString('utf-8')
        } catch {
          results.push({
            file: fileName,
            success: false,
            error: `Unsupported file type: ${fileType}`,
          })
          continue
        }
      }

      content = content.trim()

      if (!content) {
        results.push({
          file: fileName,
          success: false,
          error: 'No content extracted from file',
        })
        continue
      }

      // 1. Store the document
      console.log(`[Documents] Storing document: ${fileName}`)
      const [doc] = await db
        .insert(documents)
        .values({
          campaignId: params.campaignId,
          name: fileName,
          content,
          fileType: fileType || 'text/plain',
          uploadedBy: session.user.id,
        })
        .returning()

      // 2. Get existing entity names for deduplication
      const existingNames = await getExistingEntityNames(params.campaignId)

      // 3. Get campaign settings for extraction
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

      // 4. Run extraction pipeline
      console.log(`[Documents] Running extraction pipeline for: ${fileName} (language: ${language})`)
      console.log(`[Documents] Using extraction settings:`, extractionSettings)
      progress.push(`Running AI extraction for: ${fileName}`)
      const extraction = await runExtractionPipeline(content, fileName, existingNames, language, undefined, extractionSettings)
      progress.push(`Found ${extraction.entities.length} entities and ${extraction.relationships.length} relationships`)

      // 5. Create or update entities
      const createdEntities = []
      const entityIdMap = new Map<string, string>() // name -> entityId
      const defaultDmOnly = campaignSettings.visibility.defaultDmOnly
      progress.push(`Creating entities in database...`)

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
            console.log(`[Documents] Found existing entity: ${existing.name}`)
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
          console.log(`[Documents] Creating entity: ${extracted.name}`)
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
              isDmOnly: defaultDmOnly,
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

          // Skip embedding generation during upload (too slow)
          // Embeddings will be generated on-demand or via background job

          createdEntities.push({
            id: newEntity.id,
            name: newEntity.name,
            type: newEntity.entityType,
          })
        } catch (entityError) {
          console.error(`[Documents] Failed to create entity ${extracted.name}:`, entityError)
        }
      }

      // 6. Create relationships
      const createdRelationships = []
      if (extraction.relationships.length > 0) {
        progress.push(`Creating ${extraction.relationships.length} relationships...`)
      }

      for (const rel of extraction.relationships) {
        try {
          // Look up entity IDs
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
            console.log(`[Documents] Skipping relationship: missing entity (${rel.sourceEntity} -> ${rel.targetEntity})`)
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
          console.error(`[Documents] Failed to create relationship:`, relError)
        }
      }

      results.push({
        file: fileName,
        success: true,
        documentId: doc.id,
        entitiesCreated: createdEntities.length,
        entities: createdEntities,
        relationshipsCreated: createdRelationships.length,
        relationships: createdRelationships,
      })
    }

    const totalEntities = results.reduce((sum, r) => sum + (r.entitiesCreated || 0), 0)
    const totalRelationships = results.reduce((sum, r) => sum + (r.relationshipsCreated || 0), 0)

    progress.push(`Extraction complete: ${totalEntities} entities, ${totalRelationships} relationships`)

    return NextResponse.json({
      success: true,
      message: `Processed ${files.length} file(s), created ${totalEntities} entities and ${totalRelationships} relationships`,
      results,
      progress,
    })
  } catch (error) {
    console.error('[Documents] Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

/**
 * List documents for a campaign
 * GET /api/campaigns/{campaignId}/documents
 */
export async function GET(
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
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const docs = await db
    .select({
      id: documents.id,
      name: documents.name,
      fileType: documents.fileType,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.campaignId, params.campaignId))
    .orderBy(documents.createdAt)

  return NextResponse.json({ documents: docs })
}
