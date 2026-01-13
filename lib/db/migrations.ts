import { sql } from '@/lib/db'

/**
 * Ensure the language column exists on campaigns table
 * This is safe to run multiple times
 */
export async function ensureCampaignLanguageColumn(): Promise<void> {
  try {
    await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en' NOT NULL`
  } catch (error) {
    // Ignore if column already exists or other non-critical errors
    console.log('[Migration] Campaign language column check:', error)
  }
}

/**
 * Ensure the settings JSONB column exists on campaigns table
 * This is safe to run multiple times
 */
export async function ensureCampaignSettingsColumn(): Promise<void> {
  try {
    await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb`
  } catch (error) {
    // Ignore if column already exists or other non-critical errors
    console.log('[Migration] Campaign settings column check:', error)
  }
}

/**
 * Ensure all v2 knowledge graph tables exist
 * This is safe to run multiple times
 */
export async function ensureKnowledgeGraphTables(): Promise<{ migrated: boolean; error?: string }> {
  try {
    // Check if documents table exists
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'documents'
      ) as exists
    `

    // Also ensure campaigns has language and settings columns
    await ensureCampaignLanguageColumn()
    await ensureCampaignSettingsColumn()

    if (result[0]?.exists) {
      return { migrated: false }
    }

    // Run migration
    console.log('[Migration] Running auto-migration for knowledge graph tables...')

    // Create documents table
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

    // Create entities table
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

    // Create entity_sources table
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

    // Create relationships table
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

    // Create chunks table
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

    // Create entity_versions table
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

    console.log('[Migration] Auto-migration complete')
    return { migrated: true }
  } catch (error) {
    console.error('[Migration] Auto-migration failed:', error)
    return { migrated: false, error: String(error) }
  }
}

/**
 * Ensure the campaign_invites table exists for invite system
 * This is safe to run multiple times
 */
export async function ensureCampaignInvitesTable(): Promise<{ migrated: boolean; error?: string }> {
  try {
    // Check if campaign_invites table exists
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'campaign_invites'
      ) as exists
    `

    if (result[0]?.exists) {
      return { migrated: false }
    }

    console.log('[Migration] Creating campaign_invites table...')

    // Create campaign_invites table
    await sql`
      CREATE TABLE IF NOT EXISTS campaign_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'viewer')),
        uses_remaining INTEGER,
        expires_at TIMESTAMP,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS campaign_invites_code_idx ON campaign_invites(code)`
    await sql`CREATE INDEX IF NOT EXISTS campaign_invites_campaign_idx ON campaign_invites(campaign_id)`

    console.log('[Migration] campaign_invites table created')
    return { migrated: true }
  } catch (error) {
    console.error('[Migration] campaign_invites migration failed:', error)
    return { migrated: false, error: String(error) }
  }
}

/**
 * Ensure the joined_at column exists on campaign_members table
 * This is safe to run multiple times
 */
export async function ensureCampaignMembersJoinedAt(): Promise<void> {
  try {
    await sql`ALTER TABLE campaign_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP DEFAULT NOW() NOT NULL`
  } catch (error) {
    // Ignore if column already exists
    console.log('[Migration] Campaign members joined_at column check:', error)
  }
}

/**
 * Run all migrations
 */
export async function runAllMigrations(): Promise<void> {
  await ensureCampaignLanguageColumn()
  await ensureCampaignSettingsColumn()
  await ensureKnowledgeGraphTables()
  await ensureCampaignInvitesTable()
  await ensureCampaignMembersJoinedAt()
}
