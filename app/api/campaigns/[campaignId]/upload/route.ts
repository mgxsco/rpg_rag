import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, campaigns, campaignMembers, notes } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { syncNoteEmbeddings } from '@/lib/ai/embeddings'
import { syncNoteLinks } from '@/lib/wikilinks/sync'
import Anthropic from '@anthropic-ai/sdk'

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

interface ExtractedNote {
  title: string
  content: string
  noteType: 'session' | 'npc' | 'location' | 'item' | 'lore' | 'quest' | 'faction' | 'player_character' | 'freeform'
  tags: string[]
}

async function analyzeAndExtractNotes(content: string, fileName: string): Promise<ExtractedNote[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Upload] No ANTHROPIC_API_KEY, skipping AI analysis')
    return [{
      title: fileName.replace(/\.[^/.]+$/, ''),
      content,
      noteType: 'lore',
      tags: ['imported'],
    }]
  }

  console.log('[Upload] Analyzing content with Claude...')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: `You are a D&D campaign content analyzer. Extract structured notes from uploaded content.

Analyze the content and extract ALL relevant entities into separate notes. Each note should be self-contained.

Categories:
- npc: Named characters (NPCs, villains, allies) - include appearance, personality, motivations
- location: Places (cities, dungeons, taverns) - include description, notable features, inhabitants
- item: Magic items, artifacts, important objects - include properties, history
- quest: Quests, missions, objectives - include goals, rewards, challenges
- faction: Organizations, guilds, groups - include goals, members, influence
- lore: History, legends, world-building - include relevant context
- session: Session summaries or recaps
- freeform: Anything else important

Return ONLY a valid JSON array. Each object must have:
- title: Clear, descriptive name
- content: Detailed markdown description (include ALL relevant details)
- noteType: One of the categories above
- tags: Relevant tags as string array

Extract EVERY entity mentioned. Create separate notes for each NPC, location, item, etc.
Use [[Note Title]] wikilink syntax to reference other notes you're creating.`,
    messages: [{
      role: 'user',
      content: `Analyze this D&D content and extract all notes:\n\n---\nFile: ${fileName}\n---\n\n${content.slice(0, 50000)}`,
    }],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    console.log('[Upload] No text response from Claude')
    return [{
      title: fileName.replace(/\.[^/.]+$/, ''),
      content,
      noteType: 'lore',
      tags: ['imported'],
    }]
  }

  try {
    let jsonStr = textContent.text.trim()

    // Try to extract JSON from code blocks
    const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    } else {
      // Try to find JSON array directly
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
    }

    console.log('[Upload] Attempting to parse JSON, first 200 chars:', jsonStr.slice(0, 200))
    const extracted = JSON.parse(jsonStr) as ExtractedNote[]
    console.log(`[Upload] Extracted ${extracted.length} notes from content`)

    return extracted.filter(note =>
      note.title &&
      note.content &&
      ['session', 'npc', 'location', 'item', 'lore', 'quest', 'faction', 'player_character', 'freeform'].includes(note.noteType)
    ).map(note => ({
      ...note,
      tags: Array.isArray(note.tags) ? [...note.tags, 'imported'] : ['imported'],
    }))
  } catch (error) {
    console.error('[Upload] Failed to parse AI response:', error)
    return [{
      title: fileName.replace(/\.[^/.]+$/, ''),
      content,
      noteType: 'lore',
      tags: ['imported'],
    }]
  }
}

export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
        content = `[DOCX file: ${fileName}]\n\nNote: DOCX parsing is limited. Consider converting to PDF or TXT.`
      } else {
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

      content = content.trim()

      if (!content) {
        results.push({
          file: fileName,
          success: false,
          error: 'No content extracted from file',
        })
        continue
      }

      // Analyze content and extract notes using AI
      console.log(`[Upload] Processing file: ${fileName}`)
      const extractedNotes = await analyzeAndExtractNotes(content, fileName)
      console.log(`[Upload] Creating ${extractedNotes.length} notes from ${fileName}`)

      const createdNotes = []

      for (const extracted of extractedNotes) {
        // Generate unique slug
        let baseSlug = generateSlug(extracted.title)
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

        // Create note
        const [newNote] = await db
          .insert(notes)
          .values({
            campaignId: params.campaignId,
            authorId: session.user.id,
            title: extracted.title,
            slug,
            content: extracted.content,
            noteType: extracted.noteType,
            tags: extracted.tags,
          })
          .returning()

        // Sync embeddings for RAG
        try {
          await syncNoteEmbeddings(
            newNote.id,
            params.campaignId,
            newNote.title,
            newNote.content || ''
          )
          console.log(`[Upload] Embeddings synced for: ${newNote.title}`)
        } catch (error) {
          console.error(`[Upload] Failed to sync embeddings for ${newNote.title}:`, error)
        }

        // Sync wikilinks
        try {
          await syncNoteLinks(newNote.id, params.campaignId, newNote.content || '')
        } catch (error) {
          console.error(`[Upload] Failed to sync links for ${newNote.title}:`, error)
        }

        createdNotes.push({
          noteId: newNote.id,
          slug: newNote.slug,
          title: newNote.title,
          noteType: newNote.noteType,
        })
      }

      results.push({
        file: fileName,
        success: true,
        notesCreated: createdNotes.length,
        notes: createdNotes,
        contentLength: content.length,
      })
    }

    const totalNotes = results.reduce((sum, r) => sum + (r.notesCreated || 0), 0)

    return NextResponse.json({
      success: true,
      results,
      message: `Created ${totalNotes} notes from ${files.length} file(s)`,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
