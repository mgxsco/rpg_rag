'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { WikilinkAutocomplete } from './wikilink-autocomplete'
import { getCursorWikilinkContext } from '@/lib/wikilinks/parser'

interface NoteEditorProps {
  content: string
  onChange: (content: string) => void
  campaignId: string
  existingNotes: { title: string; slug: string }[]
}

export function NoteEditor({
  content,
  onChange,
  campaignId,
  existingNotes,
}: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteSearch, setAutocompleteSearch] = useState('')
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 })
  const [linkStartPos, setLinkStartPos] = useState(0)

  const checkForAutocomplete = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const context = getCursorWikilinkContext(content, cursorPos)

    if (context?.isInWikilink) {
      setShowAutocomplete(true)
      setAutocompleteSearch(context.searchText)
      setLinkStartPos(context.linkStart)

      // Calculate position for autocomplete dropdown
      const textBeforeCursor = content.slice(0, cursorPos)
      const lines = textBeforeCursor.split('\n')
      const currentLineIndex = lines.length - 1
      const currentLineLength = lines[currentLineIndex].length

      // Approximate position (you might need to refine this)
      const lineHeight = 24
      const charWidth = 8

      setAutocompletePosition({
        top: (currentLineIndex + 1) * lineHeight + 8,
        left: Math.min(currentLineLength * charWidth, 400),
      })
    } else {
      setShowAutocomplete(false)
    }
  }, [content])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  const handleKeyUp = (e: React.KeyboardEvent) => {
    checkForAutocomplete()
  }

  const handleClick = () => {
    checkForAutocomplete()
  }

  const handleSelectNote = (noteTitle: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const beforeLink = content.slice(0, linkStartPos)
    const afterCursor = content.slice(cursorPos)

    // Find if there's already a partial ]] after cursor
    const closingBrackets = afterCursor.startsWith(']]') ? '' : ']]'

    const newContent = `${beforeLink}[[${noteTitle}${closingBrackets}${afterCursor.replace(/^\]\]/, '')}`
    onChange(newContent)
    setShowAutocomplete(false)

    // Set cursor position after the inserted link
    setTimeout(() => {
      const newPos = linkStartPos + noteTitle.length + 4 // [[ + title + ]]
      textarea.selectionStart = newPos
      textarea.selectionEnd = newPos
      textarea.focus()
    }, 0)
  }

  const handleCloseAutocomplete = () => {
    setShowAutocomplete(false)
  }

  // Filter notes based on search
  const filteredNotes = existingNotes.filter((note) =>
    note.title.toLowerCase().includes(autocompleteSearch.toLowerCase())
  )

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        rows={15}
        className="font-mono resize-y min-h-[300px]"
        placeholder="Write your note content here...&#10;&#10;Use [[Note Title]] to link to other notes."
      />

      {showAutocomplete && (
        <WikilinkAutocomplete
          notes={filteredNotes}
          searchText={autocompleteSearch}
          position={autocompletePosition}
          onSelect={handleSelectNote}
          onClose={handleCloseAutocomplete}
        />
      )}
    </div>
  )
}
