import { db, campaigns, campaignMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

export interface AccessResult {
  campaign: typeof campaigns.$inferSelect
  membership: typeof campaignMembers.$inferSelect | undefined
  isDM: boolean
}

export interface AccessError {
  error: string
  status: number
}

/**
 * Check if a user has access to a campaign
 * Returns campaign info and role if authorized, or an error if not
 */
export async function checkCampaignAccess(
  campaignId: string,
  userId: string
): Promise<AccessResult | AccessError> {
  // Use a single query with eager loading for better performance
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
    with: {
      members: {
        where: eq(campaignMembers.userId, userId),
        limit: 1,
      },
    },
  })

  if (!campaign) {
    return { error: 'Campaign not found', status: 404 }
  }

  const membership = campaign.members[0]
  const isOwner = campaign.ownerId === userId
  const isDM = membership?.role === 'dm' || isOwner

  if (!membership && !isOwner) {
    return { error: 'Access denied', status: 403 }
  }

  return { campaign, membership, isDM }
}

/**
 * Type guard to check if the result is an error
 */
export function isAccessError(result: AccessResult | AccessError): result is AccessError {
  return 'error' in result
}
