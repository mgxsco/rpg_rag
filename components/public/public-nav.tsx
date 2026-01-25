'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, BookOpen, Network, CalendarDays } from 'lucide-react'

interface PublicNavProps {
  slug: string
}

const navItems = [
  { href: '', label: 'Overview', icon: Home },
  { href: '/entities', label: 'Wiki', icon: BookOpen },
  { href: '/graph', label: 'Graph', icon: Network },
  { href: '/sessions', label: 'Sessions', icon: CalendarDays },
]

export function PublicNav({ slug }: PublicNavProps) {
  const pathname = usePathname()
  const basePath = `/public/${slug}`

  return (
    <nav className="border-b">
      <div className="container">
        <div className="flex overflow-x-auto scrollbar-hide">
          {navItems.map((item) => {
            const href = `${basePath}${item.href}`
            const isActive = item.href === ''
              ? pathname === basePath
              : pathname.startsWith(href)

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
