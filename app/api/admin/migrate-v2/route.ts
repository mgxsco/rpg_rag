import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@vercel/postgres'

/**
 * Migration to create new Obsidian-style knowledge graph tables
 * POST /api/admin/migrate-v2
 */
export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []

  try {
    // 1. Create documents table
    console.log('[Migration V2] Creating documents table...')
    await sql`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        file_type TEXT,
        uploaded_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS documents_campaign_idx ON documents(campaign_id)`
    results.push('Created documents table')

    // 2. Create entities table
    console.log('[Migration V2] Creating entities table...')
    await sql`
      CREATE TABLE IF NOT EXISTS entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        content TEXT DEFAULT '',
        aliases TEXT[] DEFAULT '{}',
        tags TEXT[] DEFAULT '{}',
        is_dm_only BOOLEAN DEFAULT false,
        source_note_id UUID REFERENCES notes(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(campaign_id, canonical_name)
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS entities_campaign_idx ON entities(campaign_id)`
    await sql`CREATE INDEX IF NOT EXISTS entities_type_idx ON entities(campaign_id, entity_type)`
    results.push('Created entities table')

    // 3. Create entity_sources table
    console.log('[Migration V2] Creating entity_sources table...')
    await sql`
      CREATE TABLE IF NOT EXISTS entity_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        excerpt TEXT,
        confidence TEXT DEFAULT '1.0',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(entity_id, document_id)
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS entity_sources_entity_idx ON entity_sources(entity_id)`
    results.push('Created entity_sources table')

    // 4. Create relationships table
    console.log('[Migration V2] Creating relationships table...')
    await sql`
      CREATE TABLE IF NOT EXISTS relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL,
        reverse_label TEXT,
        document_id UUID REFERENCES documents(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(source_entity_id, target_entity_id, relationship_type)
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS relationships_source_idx ON relationships(source_entity_id)`
    await sql`CREATE INDEX IF NOT EXISTS relationships_target_idx ON relationships(target_entity_id)`
    await sql`CREATE INDEX IF NOT EXISTS relationships_campaign_idx ON relationships(campaign_id)`
    results.push('Created relationships table')

    // 5. Create chunks table
    console.log('[Migration V2] Creating chunks table...')
    await sql`
      CREATE TABLE IF NOT EXISTS chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        header_path TEXT[] DEFAULT '{}',
        entity_mentions TEXT[] DEFAULT '{}',
        embedding vector(1024),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS chunks_entity_idx ON chunks(entity_id)`
    await sql`CREATE INDEX IF NOT EXISTS chunks_campaign_idx ON chunks(campaign_id)`
    results.push('Created chunks table')

    // 6. Create entity_versions table
    console.log('[Migration V2] Creating entity_versions table...')
    await sql`
      CREATE TABLE IF NOT EXISTS entity_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        edited_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    results.push('Created entity_versions table')

    // 7. Add full-text search to entities
    console.log('[Migration V2] Adding full-text search...')
    try {
      await sql`
        ALTER TABLE entities
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(content, '')), 'B')
        ) STORED
      `
      await sql`CREATE INDEX IF NOT EXISTS entities_search_idx ON entities USING gin(search_vector)`
      results.push('Added full-text search to entities')
    } catch (e) {
      // This might fail if column already exists with different definition
      console.log('[Migration V2] Full-text search already configured or failed:', e)
      results.push('Full-text search: already exists or skipped')
    }

    console.log('[Migration V2] Migration completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Knowledge graph tables created successfully',
      results,
    })
  } catch (error) {
    console.error('[Migration V2] Error:', error)
    return NextResponse.json(
      {
        error: 'Migration failed',
        details: String(error),
        partialResults: results,
      },
      { status: 500 }
    )
  }
}

/**
 * Check migration status
 * GET /api/admin/migrate-v2
 */
export async function GET(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tables = ['documents', 'entities', 'entity_sources', 'relationships', 'chunks', 'entity_versions']
    const status: Record<string, boolean> = {}

    for (const table of tables) {
      const result = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = ${table}
        ) as exists
      `
      status[table] = result.rows[0]?.exists || false
    }

    // Count records in each table
    const counts: Record<string, number> = {}
    for (const table of tables) {
      if (status[table]) {
        try {
          const result = await sql.query(`SELECT COUNT(*) as count FROM ${table}`)
          counts[table] = parseInt(result.rows[0]?.count || '0')
        } catch {
          counts[table] = 0
        }
      }
    }

    return NextResponse.json({
      tables: status,
      counts,
      allMigrated: Object.values(status).every(Boolean),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check migration status', details: String(error) },
      { status: 500 }
    )
  }
}
