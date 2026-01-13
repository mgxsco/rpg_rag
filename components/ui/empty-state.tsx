import { LucideIcon, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  variant?: 'default' | 'medieval'
  subtitle?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = 'default',
  subtitle,
}: EmptyStateProps) {
  // Medieval variant with scroll background
  if (variant === 'medieval') {
    return (
      <div className={cn('empty-state-medieval', className)}>
        <div className="empty-scroll-bg">
          <div className="scroll-top" />
          <div className="scroll-content">
            {/* Animated icon with sparkles */}
            <div className="empty-icon-wrapper">
              <Icon className="empty-icon" />
              <Sparkles className="sparkle sparkle-1" />
              <Sparkles className="sparkle sparkle-2" />
              <Sparkles className="sparkle sparkle-3" />
            </div>

            <h3 className="empty-title">{title}</h3>

            {subtitle && (
              <p className="empty-subtitle">{subtitle}</p>
            )}

            {description && (
              <p className="empty-description">{description}</p>
            )}

            {/* Decorative divider */}
            <div className="empty-divider">
              <span>◆</span>
            </div>

            {action && <div className="empty-action">{action}</div>}
          </div>
          <div className="scroll-bottom" />
        </div>
      </div>
    )
  }

  // Default variant
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}
