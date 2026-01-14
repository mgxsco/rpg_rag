'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LayoutGrid, List, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCallback, useState, useTransition } from 'react'

interface EntityToolbarProps {
  campaignId: string
  view: 'grid' | 'list'
  sort: string
  search?: string
}

const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'type', label: 'Type' },
  { value: 'oldest', label: 'Oldest First' },
]

export function EntityToolbar({ campaignId, view, sort, search }: EntityToolbarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(search || '')

  const updateParams = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      startTransition(() => {
        router.push(`/campaigns/${campaignId}/entities?${params.toString()}`)
      })
    },
    [campaignId, router, searchParams]
  )

  const handleViewChange = (newView: 'grid' | 'list') => {
    updateParams('view', newView === 'grid' ? null : newView)
  }

  const handleSortChange = (newSort: string) => {
    updateParams('sort', newSort === 'updated' ? null : newSort)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams('search', searchValue || null)
  }

  const clearSearch = () => {
    setSearchValue('')
    updateParams('search', null)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3 sm:mb-4 overflow-hidden">
      {/* View Toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-3',
            view === 'grid' && 'bg-background shadow-sm'
          )}
          onClick={() => handleViewChange('grid')}
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="ml-1.5 hidden sm:inline">Grid</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-3',
            view === 'list' && 'bg-background shadow-sm'
          )}
          onClick={() => handleViewChange('list')}
        >
          <List className="h-4 w-4" />
          <span className="ml-1.5 hidden sm:inline">List</span>
        </Button>
      </div>

      {/* Sort Dropdown */}
      <Select value={sort} onValueChange={handleSortChange}>
        <SelectTrigger className="w-full sm:w-[180px] h-10 shrink-0">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Search Input */}
      <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search entities..."
            className={cn('pl-9 pr-9', isPending && 'opacity-70')}
          />
          {searchValue && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
