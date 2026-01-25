'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Moon, Sun, Eye, LogIn } from 'lucide-react'

interface PublicHeaderProps {
  campaignName: string
  slug: string
}

export function PublicHeader({ campaignName, slug }: PublicHeaderProps) {
  const { theme, setTheme } = useTheme()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/public/${slug}`} className="flex items-center gap-2">
            <span className="text-lg font-bold">{campaignName}</span>
          </Link>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs">
            <Eye className="h-3 w-3" />
            <span>Public View</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          <Link href="/login">
            <Button variant="outline" size="sm">
              <LogIn className="h-4 w-4 mr-2" />
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
