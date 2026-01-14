'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'

interface ExtractEntitiesButtonProps {
  campaignId: string
  noteSlug: string
}

export function ExtractEntitiesButton({ campaignId, noteSlug }: ExtractEntitiesButtonProps) {
  return (
    <Link href={`/campaigns/${campaignId}/notes/${noteSlug}/extract`}>
      <Button variant="outline" size="sm">
        <Sparkles className="h-4 w-4 mr-1" />
        Extract Entities
      </Button>
    </Link>
  )
}
