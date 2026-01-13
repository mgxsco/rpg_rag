import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  variant?: 'default' | 'medieval'
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export function LoadingState({
  message = 'Loading...',
  size = 'md',
  className,
  variant = 'default',
}: LoadingStateProps) {
  // Medieval variant with hourglass animation
  if (variant === 'medieval') {
    return (
      <div className={cn('loading-medieval', className)}>
        <div className="hourglass-container">
          <div className="hourglass">
            <div className="hourglass-top" />
            <div className="hourglass-middle" />
            <div className="hourglass-bottom" />
            <div className="sand-stream" />
          </div>
          {/* Magic particles */}
          <div className="magic-particle p1" />
          <div className="magic-particle p2" />
          <div className="magic-particle p3" />
        </div>
        <p className="loading-message">{message}</p>
        <div className="loading-dots">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
    )
  }

  // Default variant
  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <Loader2 className={cn('animate-spin text-primary mb-3', sizeClasses[size])} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
