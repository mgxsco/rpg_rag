'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { Home, BookOpen, ScrollText, MessageSquare, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MobileTabBar() {
  const pathname = usePathname()
  const params = useParams<{ campaignId: string }>()

  // Only show on campaign pages
  if (!params.campaignId) return null

  const campaignId = params.campaignId

  const tabs = [
    { href: `/campaigns/${campaignId}`, icon: Home, label: 'Home', exact: true },
    { href: `/campaigns/${campaignId}/entities`, icon: BookOpen, label: 'Wiki' },
    { href: `/campaigns/${campaignId}/notes`, icon: ScrollText, label: 'Notes' },
    { href: `/campaigns/${campaignId}/chat`, icon: MessageSquare, label: 'Oracle' },
    { href: `/campaigns/${campaignId}/settings`, icon: Menu, label: 'More' },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t-2 border-border pb-safe">
      <div className="flex justify-around items-center h-16">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-2',
                'transition-colors touch-manipulation',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-primary'
              )}
            >
              <tab.icon
                className={cn('h-5 w-5', isActive && 'text-[hsl(45_80%_45%)]')}
              />
              <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
