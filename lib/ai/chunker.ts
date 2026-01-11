export interface Chunk {
  text: string
  index: number
  metadata: {
    headers: string[]
  }
}

/**
 * Split markdown content into chunks for embedding
 * - Splits by headers first
 * - Then splits long sections into ~1000 char chunks with ~100 char overlap
 * - Preserves header context in metadata
 */
export function chunkContent(content: string, title: string): Chunk[] {
  const chunks: Chunk[] = []
  const TARGET_SIZE = 1000
  const OVERLAP = 100

  // Add title as context
  const contentWithTitle = `# ${title}\n\n${content}`

  // Split by headers
  const headerRegex = /^(#{1,6})\s+(.+)$/gm
  const sections: { headers: string[]; content: string }[] = []
  let lastIndex = 0
  let currentHeaders: string[] = []
  let match

  while ((match = headerRegex.exec(contentWithTitle)) !== null) {
    // Save content before this header
    if (match.index > lastIndex) {
      const sectionContent = contentWithTitle.slice(lastIndex, match.index).trim()
      if (sectionContent) {
        sections.push({
          headers: [...currentHeaders],
          content: sectionContent,
        })
      }
    }

    // Update headers based on level
    const level = match[1].length
    const headerText = match[2]

    // Keep only headers of higher level
    currentHeaders = currentHeaders.slice(0, level - 1)
    currentHeaders.push(headerText)

    lastIndex = match.index
  }

  // Don't forget the last section
  const remainingContent = contentWithTitle.slice(lastIndex).trim()
  if (remainingContent) {
    sections.push({
      headers: [...currentHeaders],
      content: remainingContent,
    })
  }

  // If no sections found, treat entire content as one section
  if (sections.length === 0) {
    sections.push({
      headers: [title],
      content: contentWithTitle,
    })
  }

  // Now chunk each section
  let chunkIndex = 0

  for (const section of sections) {
    const { headers, content: sectionContent } = section

    if (sectionContent.length <= TARGET_SIZE) {
      // Small enough to be one chunk
      chunks.push({
        text: sectionContent,
        index: chunkIndex++,
        metadata: { headers },
      })
    } else {
      // Split into smaller chunks with overlap
      let start = 0

      while (start < sectionContent.length) {
        let end = start + TARGET_SIZE

        // Try to break at sentence or paragraph boundary
        if (end < sectionContent.length) {
          // Look for paragraph break first
          const paragraphBreak = sectionContent.lastIndexOf('\n\n', end)
          if (paragraphBreak > start + TARGET_SIZE / 2) {
            end = paragraphBreak
          } else {
            // Look for sentence break
            const sentenceBreak = sectionContent.lastIndexOf('. ', end)
            if (sentenceBreak > start + TARGET_SIZE / 2) {
              end = sentenceBreak + 1
            }
          }
        }

        const chunkText = sectionContent.slice(start, end).trim()
        if (chunkText) {
          chunks.push({
            text: chunkText,
            index: chunkIndex++,
            metadata: { headers },
          })
        }

        // Move start with overlap
        start = end - OVERLAP
        if (start < end - TARGET_SIZE + OVERLAP) {
          start = end // Prevent infinite loop
        }
      }
    }
  }

  return chunks
}
