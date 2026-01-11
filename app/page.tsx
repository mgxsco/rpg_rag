import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BookOpen, Users, MessageSquare, Network } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            D&D Campaign Manager
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A collaborative wiki-style campaign manager with Obsidian-style wikilinks
            and AI-powered search for your tabletop adventures.
          </p>
        </div>

        <div className="flex justify-center gap-4 mb-16">
          <Link href="/login">
            <Button size="lg">Sign In</Button>
          </Link>
          <Link href="/register">
            <Button size="lg" variant="outline">Create Account</Button>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          <FeatureCard
            icon={<BookOpen className="h-8 w-8" />}
            title="Wiki-Style Notes"
            description="Create interconnected notes for NPCs, locations, items, and lore with [[wikilinks]]."
          />
          <FeatureCard
            icon={<Network className="h-8 w-8" />}
            title="Knowledge Graph"
            description="Visualize your campaign's connections with an interactive force-directed graph."
          />
          <FeatureCard
            icon={<MessageSquare className="h-8 w-8" />}
            title="AI-Powered Search"
            description="Ask questions about your campaign and get answers with source citations."
          />
          <FeatureCard
            icon={<Users className="h-8 w-8" />}
            title="Collaborative"
            description="DMs and players can work together with role-based permissions."
          />
        </div>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="bg-card rounded-lg p-6 border shadow-sm">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  )
}
