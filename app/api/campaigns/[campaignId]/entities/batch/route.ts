import { NextResponse } from 'next/server'
import { db, documents, entities, relationships, entitySources } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { syncEntityEmbeddings } from '@/lib/ai/entity-embeddings'
import { mergeAliases } from '@/lib/ai/extraction/dedup'
import { withCampaignAuth } from '@/lib/api/auth'
import type { BatchCommitRequest, BatchCommitResponse } from '@/lib/types'

// Sanitize text to remove null bytes and problematic characters for PostgreSQL
function sanitizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/\x00/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

type Params = { campaignId: string }

/**
 * Batch commit approved entities from staging
 * POST /api/campaigns/{campaignId}/entities/batch
 */
export const POST = withCampaignAuth<Params>(async (request, { user, access, campaignId }) => {
  const body: BatchCommitRequest = await request.json()
  const { documentName, documentContent, entities: approvedEntities, relationships: approvedRelationships } = body

  if (!approvedEntities || approvedEntities.length === 0) {
    return NextResponse.json({ error: 'No entities to commit' }, { status: 400 })
  }

  try {
    // 1. Create the document record (sanitize content)
    const [doc] = await db
      .insert(documents)
      .values({
        campaignId,
        name: sanitizeText(documentName),
        content: sanitizeText(documentContent),
        fileType: 'text/plain',
        uploadedBy: user.id,
      })
      .returning()

    // 2. Process entities - track tempId to real ID mapping
    const tempIdToRealId = new Map<string, string>()
    const createdEntities: { tempId: string; id: string; name: string }[] = []
    const mergedEntities: { tempId: string; id: string; name: string }[] = []
    const embeddingPromises: Promise<{ name: string; success: boolean }>[] = []

    for (const approved of approvedEntities) {
      try {
        // Check if this is a merge operation
        if (approved.mergeTargetId) {
          // Merge into existing entity
          const existingEntity = await db.query.entities.findFirst({
            where: and(
              eq(entities.id, approved.mergeTargetId),
              eq(entities.campaignId, campaignId)
            ),
          })

          if (existingEntity) {
            // Merge aliases
            await mergeAliases(existingEntity.id, approved.aliases)

            // Add source reference
            await db
              .insert(entitySources)
              .values({
                entityId: existingEntity.id,
                documentId: doc.id,
                excerpt: approved.content.slice(0, 500),
                confidence: '0.9',
              })
              .onConflictDoNothing()

            tempIdToRealId.set(approved.tempId, existingEntity.id)
            mergedEntities.push({
              tempId: approved.tempId,
              id: existingEntity.id,
              name: existingEntity.name,
            })
            continue
          }
        }

        // Sanitize all text fields
        const sanitizedName = sanitizeText(approved.name)
        const sanitizedContent = sanitizeText(approved.content)
        const sanitizedAliases = approved.aliases.map(a => sanitizeText(a)).filter(Boolean)
        const sanitizedTags = approved.tags.map(t => sanitizeText(t)).filter(Boolean)

        // Create new entity
        const [newEntity] = await db
          .insert(entities)
          .values({
            campaignId,
            name: sanitizedName,
            canonicalName: approved.canonicalName,
            entityType: approved.entityType,
            content: sanitizedContent,
            aliases: sanitizedAliases,
            tags: sanitizedTags,
            isDmOnly: approved.isDmOnly,
          })
          .returning()

        tempIdToRealId.set(approved.tempId, newEntity.id)

        // Add source reference
        await db.insert(entitySources).values({
          entityId: newEntity.id,
          documentId: doc.id,
          excerpt: sanitizedContent.slice(0, 500),
          confidence: '1.0',
        })

        createdEntities.push({
          tempId: approved.tempId,
          id: newEntity.id,
          name: newEntity.name,
        })

        // Queue embedding generation with tracking
        const embeddingPromise = syncEntityEmbeddings(
          newEntity.id,
          campaignId,
          newEntity.name,
          newEntity.content || ''
        )
          .then(() => ({ name: newEntity.name, success: true }))
          .catch((err) => {
            console.error(`[Batch] Embedding error for ${newEntity.name}:`, err)
            return { name: newEntity.name, success: false }
          })
        embeddingPromises.push(embeddingPromise)
      } catch (entityError) {
        console.error(`[Batch] Failed to create entity ${approved.name}:`, entityError)
      }
    }

    // 3. Create relationships
    let createdRelationshipsCount = 0

    for (const rel of approvedRelationships) {
      try {
        const sourceId = tempIdToRealId.get(rel.sourceEntityTempId)
        const targetId = tempIdToRealId.get(rel.targetEntityTempId)

        if (!sourceId || !targetId) {
          console.log(`[Batch] Skipping relationship: missing entity mapping`)
          continue
        }

        await db
          .insert(relationships)
          .values({
            campaignId,
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            relationshipType: rel.relationshipType,
            reverseLabel: rel.reverseLabel,
            documentId: doc.id,
          })
          .onConflictDoNothing()

        createdRelationshipsCount++
      } catch (relError) {
        console.error(`[Batch] Failed to create relationship:`, relError)
      }
    }

    // Wait for embeddings to complete (with timeout)
    let embeddingsSucceeded = 0
    let embeddingsFailed = 0
    if (embeddingPromises.length > 0) {
      const embeddingResults = await Promise.race([
        Promise.all(embeddingPromises),
        new Promise<{ name: string; success: boolean }[]>((resolve) =>
          setTimeout(() => resolve([]), 30000) // 30s timeout
        ),
      ])
      embeddingsSucceeded = embeddingResults.filter((r) => r.success).length
      embeddingsFailed = embeddingResults.filter((r) => !r.success).length
    }

    const response: BatchCommitResponse = {
      success: true,
      documentId: doc.id,
      createdEntities,
      mergedEntities,
      createdRelationships: createdRelationshipsCount,
      embeddingsStatus: {
        total: embeddingPromises.length,
        succeeded: embeddingsSucceeded,
        failed: embeddingsFailed,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Batch] Commit error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Commit failed' },
      { status: 500 }
    )
  }
})
