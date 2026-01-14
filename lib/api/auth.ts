import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { checkCampaignAccess, isAccessError, AccessResult } from './access'

export interface AuthContext {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>
  user: { id: string; name?: string | null; email?: string | null; image?: string | null }
}

export interface CampaignAuthContext extends AuthContext {
  access: AccessResult
  campaignId: string
}

type AuthHandler<T = void> = (
  request: NextRequest,
  context: AuthContext,
  params: T
) => Promise<NextResponse>

type CampaignAuthHandler<T = { campaignId: string }> = (
  request: NextRequest,
  context: CampaignAuthContext,
  params: T
) => Promise<NextResponse>

/**
 * Wrapper for API routes that require authentication.
 * Handles session validation and returns 401 if not authenticated.
 *
 * @example
 * export const GET = withAuth(async (request, { user }) => {
 *   return NextResponse.json({ userId: user.id })
 * })
 */
export function withAuth<T = void>(handler: AuthHandler<T>) {
  return async (request: NextRequest, { params }: { params: T }) => {
    const session = await getSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const context: AuthContext = {
      session,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
    }

    return handler(request, context, params)
  }
}

/**
 * Wrapper for API routes that require campaign access.
 * Handles session validation and campaign access check.
 * Returns 401 if not authenticated, 403/404 if no campaign access.
 *
 * @example
 * export const GET = withCampaignAuth(async (request, { user, access, campaignId }) => {
 *   const { campaign, isDM } = access
 *   return NextResponse.json({ campaign, isDM })
 * })
 */
export function withCampaignAuth<T extends { campaignId: string }>(
  handler: CampaignAuthHandler<T>
) {
  return async (request: NextRequest, { params }: { params: T }) => {
    const session = await getSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await checkCampaignAccess(params.campaignId, session.user.id)
    if (isAccessError(access)) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const context: CampaignAuthContext = {
      session,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
      access,
      campaignId: params.campaignId,
    }

    return handler(request, context, params)
  }
}

/**
 * Wrapper for API routes that require DM access.
 * Same as withCampaignAuth but returns 403 if user is not DM.
 *
 * @example
 * export const DELETE = withDMAuth(async (request, { access, campaignId }) => {
 *   // Only DMs can reach here
 *   return NextResponse.json({ success: true })
 * })
 */
export function withDMAuth<T extends { campaignId: string }>(
  handler: CampaignAuthHandler<T>
) {
  return async (request: NextRequest, { params }: { params: T }) => {
    const session = await getSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await checkCampaignAccess(params.campaignId, session.user.id)
    if (isAccessError(access)) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    if (!access.isDM) {
      return NextResponse.json({ error: 'Only DM can perform this action' }, { status: 403 })
    }

    const context: CampaignAuthContext = {
      session,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
      access,
      campaignId: params.campaignId,
    }

    return handler(request, context, params)
  }
}
