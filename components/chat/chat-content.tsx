'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'

interface ChatContentProps {
  content: string
  campaignId: string
  className?: string
}

/**
 * Renders chat content with markdown and wikilink support
 * Wikilinks [[Entity Name]] are converted to search links
 */
export function ChatContent({ content, campaignId, className = '' }: ChatContentProps) {
  // Pre-process content to convert wikilinks to markdown links
  const processedContent = useMemo(() => {
    return content.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (match, target, display) => {
        const displayText = (display || target).trim()
        const searchQuery = encodeURIComponent(target.trim())
        // Link to entities page with search query
        return `[${displayText}](/campaigns/${campaignId}/entities?search=${searchQuery})`
      }
    )
  }, [content, campaignId])

  return (
    <div className={`prose-chat ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Render links
          a: ({ href, children }) => {
            if (href?.startsWith('/campaigns/')) {
              return (
                <Link
                  href={href}
                  className="text-primary hover:underline font-medium"
                >
                  {children}
                </Link>
              )
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            )
          },
          // Inline code
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return (
                <pre className="bg-muted p-2 rounded overflow-x-auto text-xs">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            }
            return (
              <code className="bg-muted px-1 py-0.5 rounded text-xs" {...props}>
                {children}
              </code>
            )
          },
          // Keep paragraphs simple for chat
          p: ({ children }) => <span>{children}</span>,
          // Style lists
          ul: ({ children }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          // Style headers smaller for chat context
          h1: ({ children }) => <strong className="text-base block mt-2">{children}</strong>,
          h2: ({ children }) => <strong className="text-sm block mt-2">{children}</strong>,
          h3: ({ children }) => <strong className="text-sm block mt-1">{children}</strong>,
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-muted-foreground/30 pl-2 italic my-1">
              {children}
            </blockquote>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
