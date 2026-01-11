import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Check env vars
  const envStatus = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    JINA_API_KEY: !!process.env.JINA_API_KEY,
    POSTGRES_URL: !!process.env.POSTGRES_URL,
  }

  // Count notes
  const allNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.campaignId, params.campaignId))

  // Count embeddings
  const embeddingsResult = await sql`
    SELECT COUNT(*) as count FROM note_embeddings WHERE campaign_id = ${params.campaignId}
  `
  const embeddingsCount = embeddingsResult.rows[0]?.count || 0

  // Get sample embeddings
  const sampleEmbeddings = await sql`
    SELECT
      e.id,
      e.note_id,
      n.title as note_title,
      e.chunk_index,
      LEFT(e.chunk_text, 100) as chunk_preview,
      CASE WHEN e.embedding IS NULL THEN false ELSE true END as has_embedding
    FROM note_embeddings e
    JOIN notes n ON n.id = e.note_id
    WHERE e.campaign_id = ${params.campaignId}
    LIMIT 5
  `

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
    },
    envStatus,
    notes: {
      total: allNotes.length,
      titles: allNotes.map(n => n.title),
    },
    embeddings: {
      total: embeddingsCount,
      samples: sampleEmbeddings.rows,
    },
    message: embeddingsCount === 0
      ? 'No embeddings found. Click "Reindex All Notes" in Campaign Settings to generate them.'
      : `Found ${embeddingsCount} embeddings for ${allNotes.length} notes.`,
  })
}
