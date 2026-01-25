import { db, campaigns } from '@/lib/db'
import { eq } from 'drizzle-orm'

// Reserved slugs that cannot be used for public campaigns
const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'auth',
  'login',
  'register',
  'signup',
  'signin',
  'logout',
  'signout',
  'profile',
  'settings',
  'campaigns',
  'public',
  'new',
  'edit',
  'delete',
  'create',
  'update',
  'home',
  'dashboard',
  'about',
  'help',
  'support',
  'contact',
  'privacy',
  'terms',
  'tos',
])

export interface PublicCampaign {
  id: string
  name: string
  description: string | null
  publicSlug: string
}

export interface PublicAccessError {
  error: string
  status: number
}

/**
 * Check if a campaign is publicly accessible by its slug
 * Returns campaign info if public, or an error if not
 */
export async function checkPublicCampaignAccess(
  slug: string
): Promise<{ campaign: PublicCampaign } | PublicAccessError> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.publicSlug, slug),
    columns: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      publicSlug: true,
    },
  })

  if (!campaign) {
    return { error: 'Campaign not found', status: 404 }
  }

  if (!campaign.isPublic) {
    return { error: 'Campaign is not public', status: 404 }
  }

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      publicSlug: campaign.publicSlug!,
    },
  }
}

/**
 * Type guard to check if the result is an error
 */
export function isPublicAccessError(
  result: { campaign: PublicCampaign } | PublicAccessError
): result is PublicAccessError {
  return 'error' in result
}

/**
 * Check if a slug is valid for public campaigns
 * Returns an error message if invalid, null if valid
 */
export function validatePublicSlug(slug: string): string | null {
  if (!slug) {
    return 'Slug is required'
  }

  if (slug.length < 3) {
    return 'Slug must be at least 3 characters'
  }

  if (slug.length > 50) {
    return 'Slug must be at most 50 characters'
  }

  // Must be URL-friendly: lowercase letters, numbers, hyphens only
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens (must start and end with letter or number)'
  }

  // No consecutive hyphens
  if (/--/.test(slug)) {
    return 'Slug cannot contain consecutive hyphens'
  }

  if (RESERVED_SLUGS.has(slug)) {
    return 'This slug is reserved and cannot be used'
  }

  return null
}

/**
 * Check if a slug is already taken by another campaign
 * Returns true if available, false if taken
 */
export async function isSlugAvailable(
  slug: string,
  excludeCampaignId?: string
): Promise<boolean> {
  const existing = await db.query.campaigns.findFirst({
    where: eq(campaigns.publicSlug, slug),
    columns: { id: true },
  })

  if (!existing) {
    return true
  }

  // If we're excluding a campaign ID (for updates), check if it's the same campaign
  if (excludeCampaignId && existing.id === excludeCampaignId) {
    return true
  }

  return false
}
