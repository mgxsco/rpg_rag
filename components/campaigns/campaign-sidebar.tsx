'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Home,
  FileText,
  Network,
  MessageSquare,
  Settings,
  ArrowLeft,
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
      href: `/campaigns/${campaignId}/notes`,
      label: 'Notes',
      icon: FileText,
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
      <div className="sticky top-24 space-y-4">
        <Link href="/campaigns">
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Campaigns
          </Button>
        </Link>

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
                    isActive && 'bg-secondary'
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
