import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Layers } from 'lucide-react'
import {
  ENTITY_TYPE_COLORS,
  getEntityTypeIcon,
  getEntityTypeLabel,
  getEntityTypeColor,
} from '@/lib/entity-colors'

interface EntityStatsProps {
  campaignId: string
  stats: Record<string, number>
  total: number
  activeType?: string
}

export function EntityStats({ campaignId, stats, total, activeType }: EntityStatsProps) {
  // Build array of types with counts, sorted by count descending
  const typeEntries = Object.entries(stats)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="mb-3 sm:mb-4 overflow-hidden">
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {/* All entities card */}
        <StatCard
          campaignId={campaignId}
          type={undefined}
          label="All"
          count={total}
          isActive={!activeType}
          colorClasses={{
            bg: 'bg-slate-500/10',
            text: 'text-slate-400',
            border: 'border-slate-500/30',
          }}
          Icon={Layers}
        />

        {/* Type-specific cards */}
        {typeEntries.map(([type, count]) => {
          const colors = getEntityTypeColor(type)
          const Icon = getEntityTypeIcon(type)
          return (
            <StatCard
              key={type}
              campaignId={campaignId}
              type={type}
              label={getEntityTypeLabel(type)}
              count={count}
              isActive={activeType === type}
              colorClasses={{
                bg: colors.bg,
                text: colors.text,
                border: colors.border,
              }}
              Icon={Icon}
            />
          )
        })}
      </div>
    </div>
  )
}

interface StatCardProps {
  campaignId: string
  type: string | undefined
  label: string
  count: number
  isActive: boolean
  colorClasses: { bg: string; text: string; border: string }
  Icon: React.ComponentType<{ className?: string }>
}

function StatCard({ campaignId, type, label, count, isActive, colorClasses, Icon }: StatCardProps) {
  const href = type
    ? `/campaigns/${campaignId}/entities?type=${type}`
    : `/campaigns/${campaignId}/entities`

  return (
    <Link href={href}>
      <div
        className={cn(
          'flex flex-col items-center justify-center min-w-[72px] px-3 py-2 rounded-lg border-2 transition-all cursor-pointer',
          colorClasses.bg,
          isActive ? 'border-primary ring-2 ring-primary/20' : colorClasses.border,
          'hover:scale-105 hover:shadow-md'
        )}
      >
        <span className={cn('text-xl font-bold', isActive ? 'text-primary' : 'text-foreground')}>
          {count}
        </span>
        <div className="flex items-center gap-1 mt-0.5">
          <Icon className={cn('h-3 w-3', colorClasses.text)} />
          <span className={cn('text-xs font-medium', colorClasses.text)}>
            {label}
          </span>
        </div>
      </div>
    </Link>
  )
}
