import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { importCampaignBackup, validateBackup } from '@/lib/export/import'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read and parse JSON
    const text = await file.text()
    let backup: unknown

    try {
      backup = JSON.parse(text)
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid JSON file' },
        { status: 400 }
      )
    }

    // Validate backup structure
    if (!validateBackup(backup)) {
      return NextResponse.json(
        { error: 'Invalid backup file format' },
        { status: 400 }
      )
    }

    // Import the campaign
    const result = await importCampaignBackup(backup, session.user.id)

    return NextResponse.json({
      success: true,
      campaignId: result.campaignId,
      campaignName: result.campaignName,
      stats: result.stats,
      warnings: result.warnings,
    })
  } catch (error) {
    console.error('[Import] Error:', error)
    return NextResponse.json(
      { error: 'Failed to import campaign', details: String(error) },
      { status: 500 }
    )
  }
}

// Preview endpoint - validate and show stats without importing
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    let backup: unknown

    try {
      backup = JSON.parse(text)
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid JSON file' },
        { status: 400 }
      )
    }

    if (!validateBackup(backup)) {
      return NextResponse.json(
        { error: 'Invalid backup file format' },
        { status: 400 }
      )
    }

    // Return preview without importing
    return NextResponse.json({
      valid: true,
      campaign: {
        name: backup.campaign.name,
        description: backup.campaign.description,
        language: backup.campaign.language,
      },
      stats: {
        members: backup.members.length,
        entities: backup.entities.length,
        relationships: backup.relationships.length,
        documents: backup.documents.length,
      },
      exportedAt: backup.exportedAt,
      exportedBy: backup.exportedBy,
    })
  } catch (error) {
    console.error('[Import Preview] Error:', error)
    return NextResponse.json(
      { error: 'Failed to preview backup', details: String(error) },
      { status: 500 }
    )
  }
}
