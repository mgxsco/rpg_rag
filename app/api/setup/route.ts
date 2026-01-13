import { sql } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Enable pgvector extension
    await sql`CREATE EXTENSION IF NOT EXISTS vector`

    // Users table (NextAuth)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        email_verified TIMESTAMP,
        image TEXT,
        password TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `

    // Accounts table (NextAuth)
    await sql`
      CREATE TABLE IF NOT EXISTS accounts (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        PRIMARY KEY (provider, provider_account_id)
      )
    `

    // Sessions table (NextAuth)
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT NOT NULL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires TIMESTAMP NOT NULL
      )
    `

    // Verification tokens (NextAuth)
    await sql`
      CREATE TABLE IF NOT EXISTS verification_tokens (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL,
        expires TIMESTAMP NOT NULL,
        PRIMARY KEY (identifier, token)
      )
    `

    // Campaigns
    await sql`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `

    // Campaign members
    await sql`
      CREATE TABLE IF NOT EXISTS campaign_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('dm', 'player', 'viewer')),
        UNIQUE (campaign_id, user_id)
      )
    `

    // Notes
    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        content TEXT DEFAULT '',
        note_type TEXT NOT NULL CHECK (note_type IN ('session', 'npc', 'location', 'item', 'lore', 'quest', 'faction', 'player_character', 'freeform')),
        tags TEXT[] DEFAULT '{}',
        is_dm_only BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (campaign_id, slug)
      )
    `

    await sql`CREATE INDEX IF NOT EXISTS notes_campaign_idx ON notes(campaign_id)`

    // Note links (for wikilinks)
    await sql`
      CREATE TABLE IF NOT EXISTS note_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        target_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        UNIQUE (source_note_id, target_note_id)
      )
    `

    // Note versions (history)
    await sql`
      CREATE TABLE IF NOT EXISTS note_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        edited_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `

    // Note embeddings (for RAG)
    await sql`
      CREATE TABLE IF NOT EXISTS note_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(1024)
      )
    `

    await sql`CREATE INDEX IF NOT EXISTS embeddings_campaign_idx ON note_embeddings(campaign_id)`

    return NextResponse.json({
      success: true,
      message: 'Database setup complete! All tables created successfully.'
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
