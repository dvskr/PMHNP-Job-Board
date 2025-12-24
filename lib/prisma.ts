import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

if (!globalForPrisma.pool) {
  // Use DIRECT_URL for scripts/CLI, DATABASE_URL for app runtime
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
  
  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set')
  }
  
  // Conservative pool size to work within Supabase Session mode limits
  // Supabase Session mode has limited connections shared across all workers
  // Default: 2 connections per pool (safe for 3 build workers = 6 total)
  // Can be overridden via DATABASE_POOL_SIZE env var for production runtime
  const poolSize = parseInt(process.env.DATABASE_POOL_SIZE || '2', 10)
  
  console.log(`[Prisma] Initializing connection pool (size: ${poolSize})...`)
  
  globalForPrisma.pool = new Pool({ 
    connectionString,
    max: poolSize,
    idleTimeoutMillis: 10000, // 10 seconds idle timeout
    connectionTimeoutMillis: 10000, // 10 seconds to connect
    allowExitOnIdle: true, // Allow connections to close when idle
  })
  
  // Handle pool errors gracefully
  globalForPrisma.pool.on('error', (err) => {
    console.error('[Prisma] Unexpected error on idle client:', err)
  })
  
  if (process.env.NODE_ENV === 'development') {
    globalForPrisma.pool.on('connect', () => {
      console.log('[Prisma] New client connected to database')
    })
  }
}

const adapter = new PrismaPg(globalForPrisma.pool)

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({ 
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma
