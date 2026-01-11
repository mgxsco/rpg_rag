'use client'

import { useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText } from 'lucide-react'

interface WikilinkAutocompleteProps {
  notes: { title: string; slug: string }[]
  searchText: string
  position: { top: number; left: number }
  onSelect: (title: string) => void
  onClose: () => void
}

export function WikilinkAutocomplete({
  notes,
  searchText,
  position,
  onSelect,
  onClose,
}: WikilinkAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  if (notes.length === 0 && !searchText) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-50"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <Card className="w-64 shadow-lg">
        <CardContent className="p-0">
          <ScrollArea className="max-h-48">
            {notes.length > 0 ? (
              <div className="py-1">
                {notes.slice(0, 10).map((note) => (
                  <button
                    key={note.slug}
                    onClick={() => onSelect(note.title)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{note.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 text-sm text-muted-foreground text-center">
                No matching notes found.
                <br />
                <span className="text-xs">
                  Press ]] to create &quot;{searchText}&quot;
                </span>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
