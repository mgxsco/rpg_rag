import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@vercel/postgres'

/**
 * Migration to add session-specific fields to entities table
 * POST /api/admin/migrate-sessions
 */
export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []

  try {
    // Add session_number column
    console.log('[Migration Sessions] Adding session_number column...')
    await sql`ALTER TABLE entities ADD COLUMN IF NOT EXISTS session_number INTEGER`
    results.push('Added session_number column')

    // Add session_date column
    console.log('[Migration Sessions] Adding session_date column...')
    await sql`ALTER TABLE entities ADD COLUMN IF NOT EXISTS session_date TIMESTAMP`
    results.push('Added session_date column')

    // Add in_game_date column
    console.log('[Migration Sessions] Adding in_game_date column...')
    await sql`ALTER TABLE entities ADD COLUMN IF NOT EXISTS in_game_date TEXT`
    results.push('Added in_game_date column')

    // Add session_status column
    console.log('[Migration Sessions] Adding session_status column...')
    await sql`ALTER TABLE entities ADD COLUMN IF NOT EXISTS session_status TEXT`
    results.push('Added session_status column')

    console.log('[Migration Sessions] Migration completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Session columns added successfully',
      results,
    })
  } catch (error) {
    console.error('[Migration Sessions] Error:', error)
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
