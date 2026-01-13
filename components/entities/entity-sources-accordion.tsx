'use client'

import { useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Source {
  id: string
  excerpt?: string | null
  document: {
    id: string
    name: string
    createdAt: Date
  }
}

interface EntitySourcesAccordionProps {
  sources: Source[]
}

export function EntitySourcesAccordion({ sources }: EntitySourcesAccordionProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (sources.length === 0) {
    return null
  }

  return (
    <div className="border rounded-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Sources</span>
          <span className="text-muted-foreground">({sources.length})</span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2">
          <div className="h-px bg-border" />
          {sources.map((source) => (
            <div
              key={source.id}
              className="border-l-2 border-muted pl-3 py-1"
            >
              <p className="font-medium text-xs truncate">
                {source.document.name}
              </p>
              {source.excerpt && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  "{source.excerpt}"
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {new Date(source.document.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
