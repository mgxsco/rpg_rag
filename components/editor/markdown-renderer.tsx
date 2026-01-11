'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { renderWikilinks } from '@/lib/wikilinks/parser'

interface MarkdownRendererProps {
  content: string
  campaignId: string
  noteMap: Map<string, string> // title.toLowerCase() -> slug or entityId
  isEntityMode?: boolean // Link to entities instead of notes
}

export function MarkdownRenderer({
  content,
  campaignId,
  noteMap,
  isEntityMode = false,
}: MarkdownRendererProps) {
  // Pre-process content to convert wikilinks to markdown links
  const processedContent = renderWikilinks(content, noteMap, campaignId, isEntityMode)

  return (
    <div className="prose-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('/campaigns/')) {
              return (
                <Link href={href} className="wikilink">
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
          // Custom rendering for code blocks
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            )
          },
          // Render broken wikilinks
          p: ({ children, ...props }) => {
            // Check if children contains our broken link marker
            if (typeof children === 'string' && children.includes('wikilink-broken')) {
              return (
                <p
                  {...props}
                  dangerouslySetInnerHTML={{ __html: children }}
                />
              )
            }
            return <p {...props}>{children}</p>
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
