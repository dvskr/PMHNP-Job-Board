/**
 * Test Script: Verify Salary Normalizer Fixes
 * 
 * This script tests that high hourly rates are now accepted
 */

import { normalizeSalary } from '../lib/salary-normalizer';

console.log('🧪 Testing Salary Normalizer Fixes\n');
console.log('=' .repeat(80) + '\n');

interface TestCase {
  description: string;
  minSalary: number | null;
  maxSalary: number | null;
  salaryPeriod: string | null;
  shouldAccept: boolean;
}

const testCases: TestCase[] = [
  // HIGH HOURLY RATES (Previously rejected, should NOW be accepted)
  {
    description: 'SonderMind DC - $127/hour',
    minSalary: 127,
    maxSalary: null,
    salaryPeriod: 'hourly',
    shouldAccept: true,
  },
  {
    description: 'SonderMind Louisiana - $200/hour',
    minSalary: 200,
    maxSalary: null,
    salaryPeriod: 'hourly',
    shouldAccept: true,
  },
  {
    description: 'SonderMind Illinois - $248/hour',
    minSalary: 248,
    maxSalary: null,
    salaryPeriod: 'hourly',
    shouldAccept: true,
  },
  {
    description: 'High-end contractor - $300/hour',
    minSalary: 300,
    maxSalary: null,
    salaryPeriod: 'hourly',
    shouldAccept: true,
  },
  {
    description: 'Contractor range - $150-250/hour',
    minSalary: 150,
    maxSalary: 250,
    salaryPeriod: 'hourly',
    shouldAccept: true,
  },
  
  // REASONABLE ANNUAL SALARIES
  {
    description: 'W-2 salary - $120k-150k/year',
    minSalary: 120000,
    maxSalary: 150000,
    salaryPeriod: 'annual',
    shouldAccept: true,
  },
  {
    description: 'High W-2 salary - $200k/year',
    minSalary: 200000,
    maxSalary: null,
    salaryPeriod: 'annual',
    shouldAccept: true,
  },
  {
    description: 'Very high W-2 - $280k/year',
    minSalary: 280000,
    maxSalary: null,
    salaryPeriod: 'annual',
    shouldAccept: true,
  },
  
  // EDGE CASES (Should be rejected)
  {
    description: 'Too high hourly - $400/hour',
    minSalary: 400,
    maxSalary: null,
    salaryPeriod: 'hourly',
    shouldAccept: false,
  },
  {
    description: 'Too low hourly - $30/hour',
    minSalary: 30,
    maxSalary: null,
    salaryPeriod: 'hourly',
    shouldAccept: false,
  },
  {
    description: 'Too low annual - $40k/year',
    minSalary: 40000,
    maxSalary: null,
    salaryPeriod: 'annual',
    shouldAccept: false,
  },
  {
    description: 'Too high annual - $600k/year',
    minSalary: 600000,
    maxSalary: null,
    salaryPeriod: 'annual',
    shouldAccept: false,
  },
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = normalizeSalary({
    minSalary: test.minSalary,
    maxSalary: test.maxSalary,
    salaryPeriod: test.salaryPeriod,
    title: test.description,
  });
  
  const wasAccepted = result.normalizedMinSalary !== null || result.normalizedMaxSalary !== null;
  const testPassed = wasAccepted === test.shouldAccept;
  
  if (testPassed) {
    passed++;
    console.log(`✅ PASS: ${test.description}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${test.description}`);
  }
  
  console.log(`   Input:    $${test.minSalary?.toLocaleString() || '?'}${test.maxSalary ? `-${test.maxSalary.toLocaleString()}` : ''} ${test.salaryPeriod}`);
  console.log(`   Output:   $${result.normalizedMinSalary?.toLocaleString() || 'NULL'}${result.normalizedMaxSalary ? `-${result.normalizedMaxSalary.toLocaleString()}` : ''}`);
  console.log(`   Expected: ${test.shouldAccept ? 'ACCEPT' : 'REJECT'} | Got: ${wasAccepted ? 'ACCEPTED' : 'REJECTED'}`);
  console.log();
}

console.log('=' .repeat(80));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${testCases.length} total)`);

if (failed === 0) {
  console.log('✅ All tests passed! Salary normalizer is working correctly.\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the output above.\n');
  process.exit(1);
}

