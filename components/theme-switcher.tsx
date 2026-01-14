'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-react'
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
      className="h-9 w-9 relative"
      title={isDark ? 'Switch to parchment' : 'Switch to candlelight'}
    >
      <Sun className={cn(
        'h-5 w-5 transition-all',
        isDark ? 'scale-0 rotate-90' : 'scale-100 rotate-0'
      )} />
      <Moon className={cn(
        'absolute h-5 w-5 transition-all',
        isDark ? 'scale-100 rotate-0' : 'scale-0 -rotate-90'
      )} />
      <span className="sr-only">
        {isDark ? 'Switch to parchment' : 'Switch to candlelight'}
      </span>
    </Button>
  )
}
