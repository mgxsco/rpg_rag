'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Edit, GitMerge, Trash2 } from 'lucide-react'
import { DeleteEntityDialog } from './delete-entity-dialog'
import { MergeEntityDialog } from './merge-entity-dialog'

interface EntityDetailActionsProps {
  entityId: string
  entityName: string
  campaignId: string
  variant?: 'default' | 'sidebar'
}

export function EntityDetailActions({
  entityId,
  entityName,
  campaignId,
  variant = 'default',
}: EntityDetailActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)

  const isSidebar = variant === 'sidebar'

  return (
    <>
      <div className={isSidebar ? 'flex flex-col gap-1.5' : 'flex gap-2'}>
        <Link href={`/campaigns/${campaignId}/entities/${entityId}/edit`}>
          <Button size="sm" className={isSidebar ? 'w-full justify-start' : ''}>
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </Link>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMergeOpen(true)}
          className={isSidebar ? 'w-full justify-start' : ''}
        >
          <GitMerge className="h-4 w-4 mr-1" />
          Merge
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDeleteOpen(true)}
          className={`text-destructive hover:text-destructive ${isSidebar ? 'w-full justify-start' : ''}`}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>

      <DeleteEntityDialog
        entityId={entityId}
        entityName={entityName}
        campaignId={campaignId}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        redirectTo={`/campaigns/${campaignId}/entities`}
      />

      <MergeEntityDialog
        currentEntityId={entityId}
        currentEntityName={entityName}
        campaignId={campaignId}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />
    </>
  )
}
