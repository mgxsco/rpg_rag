'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Shield, Eye, Users, Scroll, CheckCircle, XCircle } from 'lucide-react'

interface InviteInfo {
  code: string
  role: 'player' | 'viewer'
  expiresAt: string | null
  campaign: {
    id: string
    name: string
    description: string | null
    owner: {
      name: string | null
    }
  }
}

export default function InvitePage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ campaign: { id: string; name: string }; alreadyMember?: boolean } | null>(null)

  // Load invite info
  useEffect(() => {
    loadInvite()
  }, [params.code])

  const loadInvite = async () => {
    try {
      const response = await fetch(`/api/invites/${params.code}`)
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Invite not found')
        return
      }

      setInvite(data.invite)
    } catch (err) {
      setError('Failed to load invite')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!session) {
      // Redirect to sign in with callback to this page
      signIn(undefined, { callbackUrl: `/invite/${params.code}` })
      return
    }

    setJoining(true)
    try {
      const response = await fetch(`/api/invites/${params.code}/join`, {
        method: 'POST',
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to join campaign')
        return
      }

      setSuccess(data)
    } catch (err) {
      setError('Failed to join campaign')
    } finally {
      setJoining(false)
    }
  }

  const handleGoToCampaign = () => {
    if (success?.campaign.id) {
      router.push(`/campaigns/${success.campaign.id}`)
    }
  }

  // Loading state
  if (loading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-[hsl(35_25%_90%)]">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-[hsl(35_25%_90%)] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              This invite link may have expired or been revoked. Please ask the campaign owner for a new invite.
            </p>
            <Button variant="outline" onClick={() => router.push('/campaigns')}>
              Go to Campaigns
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-[hsl(35_25%_90%)] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>
              {success.alreadyMember ? 'Already a Member' : 'Welcome to the Party!'}
            </CardTitle>
            <CardDescription>
              {success.alreadyMember
                ? `You're already a member of ${success.campaign.name}`
                : `You've joined ${success.campaign.name}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={handleGoToCampaign} className="w-full">
              <Scroll className="h-4 w-4 mr-2" />
              Enter Campaign
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Invite preview state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-[hsl(35_25%_90%)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* Decorative header */}
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-[hsl(45_80%_45%)] to-[hsl(25_70%_35%)] flex items-center justify-center mb-4 shadow-lg">
            <Scroll className="h-8 w-8 text-white" />
          </div>

          <CardTitle className="text-xl">You've Been Invited!</CardTitle>
          <CardDescription>
            {invite?.campaign.owner.name || 'A dungeon master'} invites you to join their campaign
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Campaign info */}
          <div className="p-4 rounded-sm border-2 border-[hsl(45_80%_45%)] bg-gradient-to-b from-[hsl(35_30%_92%)] to-[hsl(35_25%_88%)]">
            <h3 className="font-semibold text-lg" style={{ fontFamily: 'Cinzel, serif' }}>
              {invite?.campaign.name}
            </h3>
            {invite?.campaign.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {invite.campaign.description}
              </p>
            )}
          </div>

          {/* Role info */}
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              {invite?.role === 'player' ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
              <span>
                You'll join as a <strong className="capitalize">{invite?.role}</strong>
              </span>
            </div>
          </div>

          {/* Action buttons */}
          {session ? (
            <Button onClick={handleJoin} disabled={joining} className="w-full" size="lg">
              {joining ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Join Campaign
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button onClick={handleJoin} className="w-full" size="lg">
                <Users className="h-4 w-4 mr-2" />
                Sign In to Join
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                You'll need to sign in or create an account to join this campaign.
              </p>
            </div>
          )}

          {/* Error display */}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {/* Expiry warning */}
          {invite?.expiresAt && (
            <p className="text-xs text-center text-muted-foreground">
              This invite expires on {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
