import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

/**
 * Run database migrations
 * POST /api/migrate
 *
 * This endpoint creates the new tables for the fact-based extraction system.
 * Only campaign owners/admins should run this.
 */
export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Check if tables already exist
    const tableCheck = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('entity_facts', 'fact_mentions')
    `)

    const existingTables = (tableCheck as any).rows?.map((r: any) => r.table_name) || []

    const results: string[] = []

    // Create entity_facts table if not exists
    if (!existingTables.includes('entity_facts')) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS entity_facts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          section TEXT NOT NULL,
          source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
          source_session_id UUID REFERENCES entities(id) ON DELETE SET NULL,
          source_excerpt TEXT,
          confidence TEXT DEFAULT '1.0',
          is_dm_only BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS entity_facts_entity_idx ON entity_facts(entity_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS entity_facts_campaign_idx ON entity_facts(campaign_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS entity_facts_section_idx ON entity_facts(section)`)
      results.push('Created entity_facts table')
    } else {
      results.push('entity_facts table already exists')
    }

    // Create fact_mentions table if not exists
    if (!existingTables.includes('fact_mentions')) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS fact_mentions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          fact_id UUID NOT NULL REFERENCES entity_facts(id) ON DELETE CASCADE,
          mentioned_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          relationship_type TEXT
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS fact_mentions_fact_idx ON fact_mentions(fact_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS fact_mentions_entity_idx ON fact_mentions(mentioned_entity_id)`)
      results.push('Created fact_mentions table')
    } else {
      results.push('fact_mentions table already exists')
    }

    // Add summary columns to entities if not exists
    try {
      await db.execute(sql`ALTER TABLE entities ADD COLUMN IF NOT EXISTS summary TEXT`)
      results.push('Added summary column to entities')
    } catch (e) {
      results.push('summary column already exists or could not be added')
    }

    try {
      await db.execute(sql`ALTER TABLE entities ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMP`)
      results.push('Added summary_generated_at column to entities')
    } catch (e) {
      results.push('summary_generated_at column already exists or could not be added')
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Migration completed',
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Migration] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Migration failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Check migration status
 * GET /api/migrate
 */
export async function GET(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const tableCheck = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('entity_facts', 'fact_mentions')
    `)

    const existingTables = (tableCheck as any).rows?.map((r: any) => r.table_name) || []

    // Check for columns
    const columnCheck = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'entities'
      AND column_name IN ('summary', 'summary_generated_at')
    `)

    const existingColumns = (columnCheck as any).rows?.map((r: any) => r.column_name) || []

    return new Response(
      JSON.stringify({
        tables: {
          entity_facts: existingTables.includes('entity_facts'),
          fact_mentions: existingTables.includes('fact_mentions'),
        },
        columns: {
          'entities.summary': existingColumns.includes('summary'),
          'entities.summary_generated_at': existingColumns.includes('summary_generated_at'),
        },
        migrationNeeded: existingTables.length < 2 || existingColumns.length < 2,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Check failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
