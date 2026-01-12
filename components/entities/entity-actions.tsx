'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Edit, GitMerge, Trash2 } from 'lucide-react'
import { DeleteEntityDialog } from './delete-entity-dialog'
import { MergeEntityDialog } from './merge-entity-dialog'

interface EntityActionsProps {
  entityId: string
  entityName: string
  campaignId: string
  isDM: boolean
  redirectAfterDelete?: string
}

export function EntityActions({
  entityId,
  entityName,
  campaignId,
  isDM,
  redirectAfterDelete,
}: EntityActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem asChild>
            <Link href={`/campaigns/${campaignId}/entities/${entityId}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </DropdownMenuItem>
          {isDM && (
            <>
              <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
                <GitMerge className="mr-2 h-4 w-4" />
                Merge into this
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDeleteOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteEntityDialog
        entityId={entityId}
        entityName={entityName}
        campaignId={campaignId}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        redirectTo={redirectAfterDelete}
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
