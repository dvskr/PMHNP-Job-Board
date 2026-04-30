import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

if (!globalForPrisma.pool) {
  // IMPORTANT: Use DATABASE_URL (pooled via PgBouncer) for app runtime
  // Only use DIRECT_URL for migrations/scripts that need schema access
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL must be set')
  }

  console.log('[Prisma] Initializing connection pool...')

  globalForPrisma.pool = new Pool({
    connectionString,
    // Pool sizing for Vercel serverless + Supabase PgBouncer:
    // Each function instance gets its own Pool. Vercel cold-starts can
    // spin up 50-100 instances during bot crawl bursts. With max=10 that
    // produced 500-1000 simultaneous conns to PgBouncer → EMAXCONN
    // (observed 2026-04-30 05:55-05:57 UTC: 108 EMAXCONN errors during
    // a Mozilla/Googlebot/GPTBot burst on /jobs/* SEO pages).
    //
    // PgBouncer in transaction mode multiplexes — each query borrows a
    // backend conn for the statement only, so 1 client conn per instance
    // is plenty. Burst headroom comes from PgBouncer's 200-500 client
    // capacity, not from per-instance pooling.
    max: 2,
    idleTimeoutMillis: 20000, // 20 seconds
    connectionTimeoutMillis: 10000, // 10 seconds to connect
    allowExitOnIdle: true, // Allow cleanup in serverless
    // NOTE: statement_timeout is NOT supported by PgBouncer in transaction mode.
    // connectionTimeoutMillis handles connection-level timeouts instead.
  })

  // Handle pool errors gracefully
  globalForPrisma.pool.on('error', (err) => {
    console.error('[Prisma] Unexpected error on idle client:', err)
  })
}

const adapter = new PrismaPg(globalForPrisma.pool)

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  } as any)
}

export const prisma = globalForPrisma.prisma
