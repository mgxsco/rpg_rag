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
}

export function EntityDetailActions({
  entityId,
  entityName,
  campaignId,
}: EntityDetailActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)

  return (
    <>
      <div className="flex gap-2">
        <Link href={`/campaigns/${campaignId}/entities/${entityId}/edit`}>
          <Button size="sm">
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </Link>
        <Button size="sm" variant="outline" onClick={() => setMergeOpen(true)}>
          <GitMerge className="h-4 w-4 mr-1" />
          Merge
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDeleteOpen(true)}
          className="text-destructive hover:text-destructive"
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
