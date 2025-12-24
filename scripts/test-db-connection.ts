import * as dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment variables first
dotenv.config({ path: '.env.local' });

async function testConnection() {
  console.log('🔌 Testing database connection...\n');
  
  console.log('Environment variables:');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ Not set'}`);
  console.log(`  DIRECT_URL: ${process.env.DIRECT_URL ? '✓ Set' : '✗ Not set'}\n`);
  
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL or DIRECT_URL must be set');
    process.exit(1);
  }
  
  console.log(`Connecting to: ${connectionString.replace(/:[^:@]+@/, ':****@')}\n`);
  
  const pool = new Pool({ 
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    console.log('Attempting to connect...');
    const client = await pool.connect();
    console.log('✅ Connection successful!\n');
    
    console.log('Testing query...');
    await client.query('SELECT 1 as test');
    console.log('✅ Query successful!\n');
    
    console.log('Counting jobs...');
    const jobResult = await client.query('SELECT COUNT(*) as count FROM jobs');
    console.log(`📊 Total jobs in database: ${jobResult.rows[0].count}\n`);
    
    console.log('Counting companies...');
    const companyResult = await client.query('SELECT COUNT(*) as count FROM companies');
    console.log(`🏢 Total companies in database: ${companyResult.rows[0].count}\n`);
    
    console.log('Counting job alerts...');
    const alertResult = await client.query('SELECT COUNT(*) as count FROM job_alerts');
    console.log(`🔔 Total job alerts in database: ${alertResult.rows[0].count}\n`);
    
    client.release();
    await pool.end();
    
    console.log('✅ All tests passed! Database connection is working perfectly.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error);
    await pool.end();
    process.exit(1);
  }
}

testConnection();

