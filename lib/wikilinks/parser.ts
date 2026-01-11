export interface WikilinkMatch {
  target: string
  display: string
  start: number
  end: number
}

/**
 * Parse wikilinks from content
 * Supports [[Note Title]] and [[Note Title|Display Text]] formats
 */
export function parseWikilinks(content: string): WikilinkMatch[] {
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  const links: WikilinkMatch[] = []
  let match

  while ((match = regex.exec(content)) !== null) {
    links.push({
      target: match[1].trim(),
      display: (match[2] || match[1]).trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return links
}

/**
 * Convert a note title to a URL-friendly slug
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Convert a slug back to a readable title (approximate)
 */
export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Extract unique link targets from content
 */
export function getUniqueLinkTargets(content: string): string[] {
  const links = parseWikilinks(content)
  const targets = new Set(links.map((l) => l.target.toLowerCase()))
  return Array.from(targets)
}

/**
 * Check if cursor is inside a wikilink
 */
export function getCursorWikilinkContext(
  content: string,
  cursorPosition: number
): { isInWikilink: boolean; searchText: string; linkStart: number } | null {
  // Look backward from cursor for [[
  let start = cursorPosition
  while (start > 0 && content.slice(start - 2, start) !== '[[') {
    if (content.slice(start - 2, start) === ']]') {
      return null // We're after a closed link
    }
    start--
  }

  if (start <= 0 && content.slice(0, 2) !== '[[') {
    return null
  }

  // Check if there's a ]] between start and cursor
  const textAfterOpen = content.slice(start, cursorPosition)
  if (textAfterOpen.includes(']]')) {
    return null
  }

  // Extract the search text (everything after [[ up to cursor, excluding |)
  const searchText = textAfterOpen.split('|')[0]

  return {
    isInWikilink: true,
    searchText,
    linkStart: start - 2,
  }
}

/**
 * Replace wikilinks with rendered links
 */
export function renderWikilinks(
  content: string,
  noteMap: Map<string, string>, // title.toLowerCase() -> slug or entityId
  campaignId: string,
  isEntityMode: boolean = false
): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (match, target, display) => {
      const targetLower = target.trim().toLowerCase()
      const displayText = (display || target).trim()
      const id = noteMap.get(targetLower)

      if (id) {
        const path = isEntityMode
          ? `/campaigns/${campaignId}/entities/${id}`
          : `/campaigns/${campaignId}/notes/${id}`
        return `[${displayText}](${path})`
      } else {
        // Broken link - return with special marker
        return `<span class="wikilink-broken" data-target="${target.trim()}">${displayText}</span>`
      }
    }
  )
}
