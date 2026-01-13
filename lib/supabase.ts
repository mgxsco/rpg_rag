import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Singleton pattern for client-side Supabase client
let supabaseClient: SupabaseClient | null = null

/**
 * Get Supabase client for client-side usage (realtime subscriptions)
 * Uses anon key which has row-level security applied
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_DATABASE_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_DATABASE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not configured - realtime disabled')
    return null
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })

  return supabaseClient
}

/**
 * Get Supabase client for server-side usage
 * Uses service role key which bypasses row-level security
 * Only use in API routes, never expose to client
 */
export function getSupabaseServer(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_DATABASE_SUPABASE_URL
  const supabaseServiceKey = process.env.DATABASE_SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase server environment variables are not configured')
  }

  // Create a new client for each server request (no singleton)
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Channel name helper for campaign chat
 */
export function getCampaignChannelName(campaignId: string): string {
  return `campaign-${campaignId}`
}
