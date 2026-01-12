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
      href: `/campaigns/${campaignId}/graph`,
      label: 'Knowledge Graph',
      icon: Network,
    },
    {
      href: `/campaigns/${campaignId}/chat`,
      label: 'AI Chat',
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
    <aside className="w-64 shrink-0">
      <div className="sticky top-24 space-y-4 p-4 rounded-sm border-2 border-border bg-gradient-to-b from-card to-[hsl(35_25%_88%)] shadow-lg relative">
        {/* Decorative corner ornaments */}
        <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-[hsl(45_80%_45%)] opacity-60" />
        <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-[hsl(45_80%_45%)] opacity-60" />
        <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-[hsl(45_80%_45%)] opacity-60" />
        <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-[hsl(45_80%_45%)] opacity-60" />

        <Link href="/campaigns">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Campaigns
          </Button>
        </Link>

        {/* Gold separator */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(45_80%_45%)] to-transparent opacity-50" />

        <nav className="space-y-1">
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
                    isActive && 'bg-gradient-to-r from-secondary to-[hsl(35_30%_82%)] border border-border shadow-sm'
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
