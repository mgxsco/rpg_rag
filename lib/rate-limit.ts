/**
 * Simple in-memory rate limiter using sliding window algorithm.
 * For production with multiple instances, replace with Redis-backed implementation.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store - cleared on server restart
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds?: number
}

/**
 * Check and consume rate limit for a given key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const resetAt = now + windowMs

  const entry = rateLimitStore.get(key)

  // No existing entry or window expired - create new
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt })
    return {
      success: true,
      remaining: config.limit - 1,
      resetAt,
    }
  }

  // Within window - check limit
  if (entry.count >= config.limit) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds,
    }
  }

  // Increment count
  entry.count++
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Create a rate limit key for a user + endpoint combination
 */
export function createRateLimitKey(
  userId: string,
  endpoint: string
): string {
  return `${userId}:${endpoint}`
}

/**
 * Preset configurations for different endpoint types
 */
export const RATE_LIMITS = {
  // Chat: 20 requests per minute per user
  chat: {
    limit: 20,
    windowSeconds: 60,
  } satisfies RateLimitConfig,

  // Extraction: 60 requests per minute per user (chunks are sequential)
  extraction: {
    limit: 60,
    windowSeconds: 60,
  } satisfies RateLimitConfig,

  // Relationship discovery: 5 requests per minute (very expensive)
  discovery: {
    limit: 5,
    windowSeconds: 60,
  } satisfies RateLimitConfig,

  // Reindex/embeddings: 3 requests per minute (bulk operation)
  reindex: {
    limit: 3,
    windowSeconds: 60,
  } satisfies RateLimitConfig,

  // Spotlight: 30 requests per minute (lighter)
  spotlight: {
    limit: 30,
    windowSeconds: 60,
  } satisfies RateLimitConfig,
} as const

/**
 * Helper to create rate limit error response
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      retryAfterSeconds: result.retryAfterSeconds,
      resetAt: new Date(result.resetAt).toISOString(),
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt.toString(),
        'Retry-After': result.retryAfterSeconds?.toString() || '60',
      },
    }
  )
}

/**
 * Middleware-style rate limit check that returns a Response if limited
 */
export function withRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig
): Response | null {
  const key = createRateLimitKey(userId, endpoint)
  const result = checkRateLimit(key, config)

  if (!result.success) {
    return rateLimitResponse(result)
  }

  return null
}
