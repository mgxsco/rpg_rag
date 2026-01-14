'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ThemeSwitcher() {
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme } = useTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <div className="h-5 w-5" />
      </Button>
    )
  }

  const isDark = theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'h-9 w-9 relative overflow-hidden transition-colors',
        isDark ? 'hover:bg-amber-900/30' : 'hover:bg-amber-100'
      )}
      title={isDark ? 'Switch to daylight' : 'Switch to tavern mode'}
    >
      {/* Torch/Candle Icon */}
      <div className="relative">
        {isDark ? (
          // Lit torch - dark mode (tavern)
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Flame */}
            <path
              d="M12 2C12 2 9 6 9 9C9 11.5 10.5 13 12 13C13.5 13 15 11.5 15 9C15 6 12 2 12 2Z"
              className="fill-amber-400 animate-pulse"
            />
            <path
              d="M12 4C12 4 10.5 6.5 10.5 8C10.5 9.5 11.25 10.5 12 10.5C12.75 10.5 13.5 9.5 13.5 8C13.5 6.5 12 4 12 4Z"
              className="fill-amber-200"
            />
            {/* Torch handle */}
            <rect x="11" y="12" width="2" height="10" rx="0.5" className="fill-amber-800" />
            <rect x="10" y="13" width="4" height="2" rx="0.5" className="fill-amber-700" />
          </svg>
        ) : (
          // Sun/daylight - light mode
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Sun center */}
            <circle cx="12" cy="12" r="4" className="fill-amber-500" />
            {/* Sun rays */}
            <path
              d="M12 2V4M12 20V22M2 12H4M20 12H22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M4.93 19.07L6.34 17.66M17.66 6.34L19.07 4.93"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-amber-500"
            />
          </svg>
        )}
      </div>
      <span className="sr-only">
        {isDark ? 'Switch to daylight' : 'Switch to tavern mode'}
      </span>
    </Button>
  )
}
