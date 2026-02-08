
import { isRelevantJob } from '../lib/utils/job-filter';

const TEST_CASES = [
    // --- VALID ---
    { title: 'Psychiatric Nurse Practitioner', desc: 'Join our team...', expected: true },
    { title: 'PMHNP - Remote', desc: 'We need a PMHNP...', expected: true },
    { title: 'Mental Health Nurse Practitioner', desc: 'Treating patients...', expected: true },
    { title: 'Nurse Practitioner - Psychiatry', desc: 'OP clinic...', expected: true },
    { title: 'Psych NP', desc: 'Good pay...', expected: true },
    { title: 'Behavioral Health NP', desc: '...', expected: true },

    // --- INVALID (Wrong Role) ---
    { title: 'Social Worker (LCSW)', desc: 'Work with PMHNPs...', expected: false },
    { title: 'Clinical Psychologist', desc: 'PMHNP support available...', expected: false },
    { title: 'Mental Health Therapist', desc: 'Therapy role...', expected: false },
    { title: 'Staff Physician', desc: 'Psychiatrist MD needed...', expected: false },
    { title: 'Registered Nurse - Psych', desc: 'Inpatient Psych RN...', expected: false }, // RN not NP
    { title: 'Medical Assistant', desc: 'Support psych team...', expected: false },

    // --- INVALID (Generic NP) ---
    { title: 'Nurse Practitioner - Cardiology', desc: 'Heart health...', expected: false },
    { title: 'Family Nurse Practitioner', desc: 'Primary care...', expected: false },
    { title: 'Nurse Practitioner (Primary Care)', desc: '...', expected: false },

    // --- EDGE CASES ---
    { title: 'Psychiatric Nurse', desc: 'RN role...', expected: false }, // STRICT: We want NPs, not RNs.
    { title: 'Psychiatric Nurse Practitioner', desc: 'NP role...', expected: true }, // Full title should pass
    { title: 'Psychiatric Mental Health Nurse Practitioner', desc: 'PMHNP...', expected: true },
    { title: 'Nurse Practitioner', desc: 'Psychiatry department...', expected: true }, // "Nurse Practitioner" + "Psychiatry" (in positive list)
];

console.log('🧪 Testing Job Filter Criteria...\n');

let passed = 0;
let failed = 0;

TEST_CASES.forEach((test, i) => {
    const result = isRelevantJob(test.title, test.desc);
    const success = result === test.expected;

    if (success) {
        passed++;
        //    console.log(`✅ [PASS] "${test.title}" -> ${result}`);
    } else {
        failed++;
        console.error(`❌ [FAIL] "${test.title}"`);
        console.error(`   Expected: ${test.expected}, Got: ${result}`);
        console.error(`   Desc: ${test.desc.substring(0, 50)}...`);
    }
});

console.log(`\nResults: ${passed}/${TEST_CASES.length} Passed.`);

if (failed > 0) {
    console.log('\n⚠️  Adjust words in lib/utils/job-filter.ts to fix failures.');
    process.exit(1);
} else {
    console.log('\n✨ All tests passed! Logic is sound.');
}
