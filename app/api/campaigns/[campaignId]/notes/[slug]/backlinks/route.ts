import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getBacklinks } from '@/lib/wikilinks/sync'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string; slug: string }> }
) {
  const { campaignId, slug } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The slug param here is actually the noteId for backlinks
  const backlinks = await getBacklinks(slug)

  return NextResponse.json({
    backlinks: backlinks.map((note) => ({
      id: note.id,
      title: note.title,
      slug: note.slug,
      noteType: note.noteType,
    })),
  })
}
