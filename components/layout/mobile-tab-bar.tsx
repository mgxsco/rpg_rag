'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import {
  Home,
  BookOpen,
  ScrollText,
  MessageSquare,
  Menu,
  X,
  Network,
  Users,
  CalendarDays,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function MobileTabBar() {
  const pathname = usePathname()
  const params = useParams<{ campaignId: string }>()
  const [showMore, setShowMore] = useState(false)

  // Only show on campaign pages
  if (!params.campaignId) return null

  const campaignId = params.campaignId

  const mainTabs = [
    { href: `/campaigns/${campaignId}`, icon: Home, label: 'Home', exact: true },
    { href: `/campaigns/${campaignId}/entities`, icon: BookOpen, label: 'Wiki' },
    { href: `/campaigns/${campaignId}/sessions`, icon: CalendarDays, label: 'Sessions' },
    { href: `/campaigns/${campaignId}/notes`, icon: ScrollText, label: 'Notes' },
  ]

  const moreTabs = [
    { href: `/campaigns/${campaignId}/graph`, icon: Network, label: 'Knowledge Graph' },
    { href: `/campaigns/${campaignId}/party-chat`, icon: Users, label: 'Party Chat' },
    { href: `/campaigns/${campaignId}/chat`, icon: MessageSquare, label: 'Barão Pedregulho' },
    { href: `/campaigns/${campaignId}/settings`, icon: Settings, label: 'Settings' },
  ]

  const isMoreActive = moreTabs.some((tab) => pathname.startsWith(tab.href))

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* More menu panel */}
      {showMore && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 bg-card border-t-2 border-border p-2 pb-safe">
          <div className="grid grid-cols-2 gap-2">
            {moreTabs.map((tab) => {
              const isActive = pathname.startsWith(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setShowMore(false)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <tab.icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium truncate">{tab.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Main tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t-2 border-border pb-safe">
        <div className="flex justify-around items-center h-16">
          {mainTabs.map((tab) => {
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
                  className={cn('h-5 w-5', isActive && 'text-primary')}
                />
                <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              'flex flex-col items-center justify-center flex-1 h-full py-2',
              'transition-colors touch-manipulation',
              showMore || isMoreActive
                ? 'text-primary'
                : 'text-muted-foreground active:text-primary'
            )}
          >
            {showMore ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className={cn('h-5 w-5', isMoreActive && 'text-primary')} />
            )}
            <span className="text-[10px] mt-1 font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
