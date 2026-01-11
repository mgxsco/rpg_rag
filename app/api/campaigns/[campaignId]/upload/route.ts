import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'
import { syncNoteLinks } from '@/lib/wikilinks/sync'

// Dynamic import for pdf-parse to avoid build issues
async function parsePDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check membership
  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, params.campaignId),
      eq(campaignMembers.userId, session.user.id)
    ),
  })

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, params.campaignId),
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!membership && campaign.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const results = []

    for (const file of files) {
      const fileName = file.name
      const fileType = file.type
      const buffer = Buffer.from(await file.arrayBuffer())

      let content = ''
      let title = fileName.replace(/\.[^/.]+$/, '') // Remove extension

      // Parse based on file type
      if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        content = await parsePDF(buffer)
      } else if (
        fileType === 'text/plain' ||
        fileName.endsWith('.txt') ||
        fileName.endsWith('.md')
      ) {
        content = buffer.toString('utf-8')
      } else if (
        fileType === 'text/markdown' ||
        fileName.endsWith('.markdown')
      ) {
        content = buffer.toString('utf-8')
      } else if (fileType === 'text/csv' || fileName.endsWith('.csv')) {
        content = buffer.toString('utf-8')
      } else if (
        fileType === 'application/json' ||
        fileName.endsWith('.json')
      ) {
        const json = JSON.parse(buffer.toString('utf-8'))
        content = JSON.stringify(json, null, 2)
      } else if (
        fileType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.endsWith('.docx')
      ) {
        // For DOCX, we'll just extract raw text (basic support)
        // A more complete solution would use mammoth or similar
        content = `[DOCX file: ${fileName}]\n\nNote: DOCX parsing is limited. Consider converting to PDF or TXT for better results.`
      } else {
        // Try to read as text
        try {
          content = buffer.toString('utf-8')
        } catch {
          results.push({
            file: fileName,
            success: false,
            error: `Unsupported file type: ${fileType}`,
          })
          continue
        }
      }

      // Clean up content
      content = content.trim()

      if (!content) {
        results.push({
          file: fileName,
          success: false,
          error: 'No content extracted from file',
        })
        continue
      }

      // Generate unique slug
      let baseSlug = generateSlug(title)
      let slug = baseSlug
      let counter = 1

      while (true) {
        const existing = await db.query.notes.findFirst({
          where: and(
            eq(notes.campaignId, params.campaignId),
            eq(notes.slug, slug)
          ),
        })
        if (!existing) break
        slug = `${baseSlug}-${counter}`
        counter++
      }

      // Create note from file
      const [newNote] = await db
        .insert(notes)
        .values({
          campaignId: params.campaignId,
          authorId: session.user.id,
          title,
          slug,
          content,
          noteType: 'lore', // Default type for uploaded files
          tags: ['imported', fileName.split('.').pop() || 'file'],
        })
        .returning()

      // Sync embeddings for RAG (if OpenAI key is configured)
      try {
        await syncNoteEmbeddings(
          newNote.id,
          params.campaignId,
          title,
          content
        )
      } catch (error) {
        console.error('Failed to sync embeddings:', error)
        // Continue even if embedding fails
      }

      // Sync wikilinks
      try {
        await syncNoteLinks(newNote.id, params.campaignId, content)
      } catch (error) {
        console.error('Failed to sync links:', error)
      }

      results.push({
        file: fileName,
        success: true,
        noteId: newNote.id,
        slug: newNote.slug,
        title: newNote.title,
        contentLength: content.length,
      })
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Processed ${results.filter((r) => r.success).length} of ${files.length} files`,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
