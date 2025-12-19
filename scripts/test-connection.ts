import * as dotenv from 'dotenv';

// IMPORTANT: Load env BEFORE any other imports
dotenv.config({ path: '.env.local' });

import { prisma } from '../lib/prisma';

async function testConnection() {
  try {
    console.log('🔌 Testing database connection...\n');
    
    console.log('Environment variables:');
    console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ Not set'}`);
    console.log(`  DIRECT_URL: ${process.env.DIRECT_URL ? '✓ Set' : '✗ Not set'}\n`);
    
    console.log('Attempting to connect...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Connection successful!\n');
    
    console.log('Counting jobs...');
    const jobCount = await prisma.job.count();
    console.log(`📊 Total jobs in database: ${jobCount}\n`);
    
    await prisma.$disconnect();
    console.log('✅ Test complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testConnection();

