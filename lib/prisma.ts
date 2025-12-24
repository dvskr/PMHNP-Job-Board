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
    max: 5, // Keep low for serverless - PgBouncer handles pooling
    idleTimeoutMillis: 20000, // 20 seconds
    connectionTimeoutMillis: 10000, // 10 seconds to connect
    allowExitOnIdle: true, // Allow cleanup in serverless
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
  })
}

export const prisma = globalForPrisma.prisma
