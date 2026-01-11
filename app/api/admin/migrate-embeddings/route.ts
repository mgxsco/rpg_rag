import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@vercel/postgres'

export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Step 1: Delete all existing embeddings (they have wrong dimensions anyway)
    console.log('[Migration] Deleting existing embeddings...')
    await sql`DELETE FROM note_embeddings`

    // Step 2: Drop the old embedding column
    console.log('[Migration] Dropping old embedding column...')
    await sql`ALTER TABLE note_embeddings DROP COLUMN IF EXISTS embedding`

    // Step 3: Add new embedding column with 1024 dimensions
    console.log('[Migration] Adding new embedding column with 1024 dimensions...')
    await sql`ALTER TABLE note_embeddings ADD COLUMN embedding vector(1024)`

    // Step 4: Verify the change
    const result = await sql`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_name = 'note_embeddings' AND column_name = 'embedding'
    `

    console.log('[Migration] Migration completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Migration completed. The note_embeddings table now uses 1024-dimension vectors. Please reindex your notes.',
      columnInfo: result.rows[0],
    })
  } catch (error) {
    console.error('[Migration] Error:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    )
  }
}
