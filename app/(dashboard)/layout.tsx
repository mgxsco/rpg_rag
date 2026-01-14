import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { DashboardNav } from '@/components/layout/dashboard-nav'
import { MobileTabBar } from '@/components/layout/mobile-tab-bar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={session.user} />
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-20 md:pb-6">
        {children}
      </main>
      <MobileTabBar />
    </div>
  )
}
