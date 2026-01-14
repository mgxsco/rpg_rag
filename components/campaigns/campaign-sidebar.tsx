'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Home,
  Network,
  MessageSquare,
  Settings,
  ArrowLeft,
  BookOpen,
  ScrollText,
  CalendarDays,
  Users,
} from 'lucide-react'

interface CampaignSidebarProps {
  campaignId: string
  isDM: boolean
}

export function CampaignSidebar({ campaignId, isDM }: CampaignSidebarProps) {
  const pathname = usePathname()

  const links = [
    {
      href: `/campaigns/${campaignId}`,
      label: 'Overview',
      icon: Home,
      exact: true,
    },
    {
      href: `/campaigns/${campaignId}/entities`,
      label: 'Wiki',
      icon: BookOpen,
    },
    {
      href: `/campaigns/${campaignId}/sessions`,
      label: 'Sessions',
      icon: CalendarDays,
    },
    {
      href: `/campaigns/${campaignId}/notes`,
      label: 'Notes',
      icon: ScrollText,
    },
    {
      href: `/campaigns/${campaignId}/graph`,
      label: 'Knowledge Graph',
      icon: Network,
    },
    {
      href: `/campaigns/${campaignId}/party-chat`,
      label: 'Party Chat',
      icon: Users,
    },
    {
      href: `/campaigns/${campaignId}/chat`,
      label: 'Barão Pedregulho',
      icon: MessageSquare,
    },
    ...(isDM
      ? [
          {
            href: `/campaigns/${campaignId}/settings`,
            label: 'Settings',
            icon: Settings,
          },
        ]
      : []),
  ]

  return (
    <aside className="hidden md:block w-52 lg:w-56 xl:w-60 shrink-0">
      <div className="sticky top-20 space-y-2 sm:space-y-3 p-2 sm:p-3 rounded-sm border-2 border-border bg-card shadow-lg relative">
        {/* Decorative corner ornaments */}
        <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-primary/40" />
        <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-primary/40" />
        <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-primary/40" />
        <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-primary/40" />

        <Link href="/campaigns">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Campaigns
          </Button>
        </Link>

        {/* Separator */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <nav className="space-y-0.5">
          {links.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href)

            return (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start',
                    isActive && 'bg-secondary border border-border shadow-sm'
                  )}
                >
                  <link.icon className="h-4 w-4 mr-2" />
                  {link.label}
                </Button>
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
