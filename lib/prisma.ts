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
  
  console.log('[Prisma] Initializing connection pool...')
  
  globalForPrisma.pool = new Pool({ 
    connectionString,
    max: 10, // Increased for better concurrency
    idleTimeoutMillis: 30000, // 30 seconds
    connectionTimeoutMillis: 10000, // 10 seconds to connect
    allowExitOnIdle: false, // Keep pool alive
  })
  
  // Handle pool errors gracefully
  globalForPrisma.pool.on('error', (err) => {
    console.error('[Prisma] Unexpected error on idle client:', err)
  })
  
  globalForPrisma.pool.on('connect', () => {
    console.log('[Prisma] New client connected to database')
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
