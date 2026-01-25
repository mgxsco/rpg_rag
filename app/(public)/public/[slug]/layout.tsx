import { notFound } from 'next/navigation'
import { db, campaigns } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { PublicHeader } from '@/components/public/public-header'
import { PublicNav } from '@/components/public/public-nav'

interface PublicLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function PublicLayout({
  children,
  params,
}: PublicLayoutProps) {
  const { slug } = await params

  // Check if campaign exists and is public
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.publicSlug, slug),
    columns: {
      id: true,
      name: true,
      isPublic: true,
      publicSlug: true,
    },
  })

  if (!campaign || !campaign.isPublic) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader campaignName={campaign.name} slug={slug} />
      <PublicNav slug={slug} />
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.publicSlug, slug),
    columns: {
      name: true,
      description: true,
    },
  })

  if (!campaign) {
    return { title: 'Not Found' }
  }

  return {
    title: `${campaign.name} - Campaign Wiki`,
    description: campaign.description || `Explore the ${campaign.name} campaign wiki`,
  }
}
