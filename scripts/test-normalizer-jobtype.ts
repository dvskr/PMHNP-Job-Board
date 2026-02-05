import 'dotenv/config';
import { normalizeJob } from '../lib/job-normalizer';

const mockRawJobWithKey = {
    title: 'Test Job',
    description: 'This is a description without keywords.',
    applyLink: 'http://example.com',
    company: 'Test Company',
    location: 'New York, NY',
    id: '123',
    jobType: 'Contract' // Explicitly provided
};

const mockRawJobWithoutKey = {
    title: 'Test Job',
    description: 'This is a full-time position.',
    applyLink: 'http://example.com',
    company: 'Test Company',
    location: 'New York, NY',
    id: '456'
    // No jobType provided, should detect 'Full-Time'
};

const mockRawJobConflict = {
    title: 'Test Job',
    description: 'This description says part-time.',
    applyLink: 'http://example.com',
    company: 'Test Company',
    location: 'New York, NY',
    id: '789',
    jobType: 'Full-Time' // Explicitly provided, should win over description
};

console.log('--- Testing Job Normalizer Job Type Logic ---');

const result1 = normalizeJob(mockRawJobWithKey as any, 'test');
console.log(`Test 1 (Explicit Type): Expected 'Contract', Got '${result1?.jobType}'`);

const result2 = normalizeJob(mockRawJobWithoutKey as any, 'test');
console.log(`Test 2 (Detected Type): Expected 'Full-Time', Got '${result2?.jobType}'`);

const result3 = normalizeJob(mockRawJobConflict as any, 'test');
console.log(`Test 3 (Priority): Expected 'Full-Time', Got '${result3?.jobType}'`);

if (result1?.jobType === 'Contract' && result2?.jobType === 'Full-Time' && result3?.jobType === 'Full-Time') {
    console.log('✅ ALL TESTS PASSED');
} else {
    console.log('❌ TESTS FAILED');
}
