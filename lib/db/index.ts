import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

const connectionString = process.env.DATABASE_POSTGRES_URL!

// Create postgres client
// For serverless environments, we need to configure the connection appropriately
const client = postgres(connectionString, {
  prepare: false, // Required for Supabase connection pooler (Transaction mode)
})

export const db = drizzle(client, { schema })

// Export raw SQL client for complex queries (vector search, etc.)
export const sql = client

export * from './schema'
