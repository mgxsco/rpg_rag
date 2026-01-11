import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, notes, entities, chunks, noteEmbeddings } from '@/lib/db'
import { eq, sql } from 'drizzle-orm'

/**
 * Migrate existing notes to entities
 * This preserves all existing data while transitioning to the new schema
 * POST /api/admin/migrate-notes-to-entities
 */
export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all notes
    const allNotes = await db.select().from(notes)
    console.log(`[Migration] Found ${allNotes.length} notes to migrate`)

    const results = {
      notesProcessed: 0,
      entitiesCreated: 0,
      chunksMigrated: 0,
      errors: [] as string[],
    }

    for (const note of allNotes) {
      try {
        // Generate canonical name from title
        const canonicalName = note.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        // Check if entity already exists for this note
        const existingEntity = await db.query.entities.findFirst({
          where: eq(entities.sourceNoteId, note.id),
        })

        if (existingEntity) {
          console.log(`[Migration] Entity already exists for note: ${note.title}`)
          results.notesProcessed++
          continue
        }

        // Create entity from note
        const [newEntity] = await db
          .insert(entities)
          .values({
            campaignId: note.campaignId,
            name: note.title,
            canonicalName,
            entityType: note.noteType,
            content: note.content || '',
            aliases: [],
            tags: note.tags || [],
            isDmOnly: note.isDmOnly || false,
            sourceNoteId: note.id,
          })
          .onConflictDoNothing()
          .returning()

        if (newEntity) {
          results.entitiesCreated++

          // Migrate embeddings to chunks
          const noteEmbs = await db
            .select()
            .from(noteEmbeddings)
            .where(eq(noteEmbeddings.noteId, note.id))

          for (const emb of noteEmbs) {
            try {
              await db.insert(chunks).values({
                entityId: newEntity.id,
                campaignId: note.campaignId,
                content: emb.chunkText,
                chunkIndex: emb.chunkIndex,
                headerPath: [],
                entityMentions: [],
                embedding: emb.embedding,
              })
              results.chunksMigrated++
            } catch (chunkError) {
              console.error(`[Migration] Failed to migrate chunk for ${note.title}:`, chunkError)
            }
          }
        }

        results.notesProcessed++
      } catch (noteError) {
        console.error(`[Migration] Failed to migrate note ${note.title}:`, noteError)
        results.errors.push(`${note.title}: ${String(noteError)}`)
      }
    }

    console.log('[Migration] Notes to entities migration completed:', results)

    return NextResponse.json({
      success: true,
      message: `Migrated ${results.entitiesCreated} notes to entities`,
      results,
    })
  } catch (error) {
    console.error('[Migration] Error:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * Check migration status
 * GET /api/admin/migrate-notes-to-entities
 */
export async function GET(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Count notes and entities
    const notesCount = await db.select({ count: sql<number>`count(*)` }).from(notes)
    const entitiesCount = await db.select({ count: sql<number>`count(*)` }).from(entities)

    // Count notes that have been migrated
    const migratedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(entities)
      .where(sql`source_note_id IS NOT NULL`)

    return NextResponse.json({
      notes: Number(notesCount[0]?.count || 0),
      entities: Number(entitiesCount[0]?.count || 0),
      migratedNotes: Number(migratedCount[0]?.count || 0),
      fullyMigrated: Number(notesCount[0]?.count || 0) === Number(migratedCount[0]?.count || 0),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check status', details: String(error) },
      { status: 500 }
    )
  }
}
