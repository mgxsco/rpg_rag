import { redirect } from 'next/navigation'
import { getSession, getCurrentUser } from '@/lib/auth'
import { DashboardNav } from '@/components/layout/dashboard-nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/login')
  }

  const user = await getCurrentUser()

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={session.user} profile={user} />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
