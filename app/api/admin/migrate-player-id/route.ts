import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Add player_id column to entities table
    await db.execute(sql`
      ALTER TABLE entities
      ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES campaign_members(id) ON DELETE SET NULL
    `)

    // Create index for faster lookups
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS entities_player_idx ON entities(player_id)
    `)

    return NextResponse.json({
      success: true,
      message: 'Player ID migration completed successfully',
    })
  } catch (error) {
    console.error('[Migration] Error adding player_id column:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    )
  }
}
