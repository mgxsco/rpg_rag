import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { SessionProvider } from '@/components/providers/session-provider'

export const metadata: Metadata = {
  title: 'D&D Campaign Manager',
  description: 'Collaborative D&D campaign management with AI-powered search',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <SessionProvider>
          {children}
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  )
}
