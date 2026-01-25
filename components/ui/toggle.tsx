'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean
  onPressedChange?: (pressed: boolean) => void
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, pressed = false, onPressedChange, children, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onPressedChange?.(!pressed)
      props.onClick?.(e)
    }

    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={pressed}
        data-state={pressed ? 'on' : 'off'}
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
          'hover:bg-muted hover:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'border border-input bg-transparent',
          pressed && 'bg-accent text-accent-foreground',
          className
        )}
        {...props}
        onClick={handleClick}
      >
        {children}
      </button>
    )
  }
)
Toggle.displayName = 'Toggle'

export { Toggle }
