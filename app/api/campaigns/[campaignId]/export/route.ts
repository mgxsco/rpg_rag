import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateBackupExport } from '@/lib/export/backup'
import { generateCompiledExport, generateCompiledZip } from '@/lib/export/compiled'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const { searchParams } = new URL(request.url)

    const type = searchParams.get('type') || 'backup' // 'backup' | 'compiled'
    const format = searchParams.get('format') || 'json' // 'json' | 'markdown' | 'zip'
    const includeDmOnly = searchParams.get('includeDmOnly') !== 'false'

    // Check if user is DM or owner
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const membership = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, session.user.id)
      ),
    })

    const isDM = membership?.role === 'dm' || campaign.ownerId === session.user.id

    if (!isDM) {
      return NextResponse.json(
        { error: 'Only DMs can export campaigns' },
        { status: 403 }
      )
    }

    if (type === 'backup') {
      // Full JSON backup
      const backup = await generateBackupExport(campaignId, session.user.email!)

      const json = JSON.stringify(backup, null, 2)
      const safeName = campaign.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

      return new Response(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${safeName}-backup.json"`,
        },
      })
    } else if (type === 'compiled') {
      if (format === 'zip') {
        // ZIP with individual markdown files
        const { buffer, filename } = await generateCompiledZip(
          campaignId,
          includeDmOnly
        )

        return new Response(new Uint8Array(buffer), {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        })
      } else {
        // Single markdown file
        const { markdown, campaignName } = await generateCompiledExport(
          campaignId,
          includeDmOnly
        )

        const safeName = campaignName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

        return new Response(markdown, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="${safeName}.md"`,
          },
        })
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid export type. Use "backup" or "compiled"' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[Export] Error:', error)
    return NextResponse.json(
      { error: 'Failed to export campaign', details: String(error) },
      { status: 500 }
    )
  }
}
