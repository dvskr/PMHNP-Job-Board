import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

if (!globalForPrisma.pool) {
  const connectionString = process.env.DATABASE_URL
  globalForPrisma.pool = new Pool({ 
    connectionString,
    max: 5, // Reduced max connections for better stability
    idleTimeoutMillis: 60000, // Keep connections alive longer (60 seconds)
    connectionTimeoutMillis: 30000, // Longer timeout for slow connections (30 seconds)
    allowExitOnIdle: true, // Allow pool to close when idle
  })
  
  // Handle pool errors gracefully
  globalForPrisma.pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err)
  })
}

const adapter = new PrismaPg(globalForPrisma.pool)

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma
