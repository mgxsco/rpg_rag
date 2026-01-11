'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/upload/file-upload'
import { Plus } from 'lucide-react'

interface NotesActionsProps {
  campaignId: string
}

export function NotesActions({ campaignId }: NotesActionsProps) {
  const router = useRouter()

  const handleUploadComplete = () => {
    router.refresh()
  }

  return (
    <div className="flex gap-2">
      <FileUpload campaignId={campaignId} onUploadComplete={handleUploadComplete} />
      <Link href={`/campaigns/${campaignId}/notes/new`}>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Note
        </Button>
      </Link>
    </div>
  )
}
