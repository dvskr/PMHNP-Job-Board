
import { isRelevantJob } from '../lib/utils/job-filter';

const testCases = [
    {
        title: "Psychiatrist",
        description: "Looking for a psychiatrist to join our team.",
        expected: false
    },
    {
        title: "Psychiatrist/PMHNP",
        description: "Clinic seeking either a Psychiatrist or a PMHNP.",
        expected: true
    },
    {
        title: "Psychiatric Nurse Practitioner",
        description: "PMHNP working with a Psychiatrist in a collaborative setting.",
        expected: true
    },
    {
        title: "Physician",
        description: "PMHNP role.",
        expected: false // Should still be rejected because 'physician' is in title and not excluded
    }
];

console.log("🧪 Testing Refined Filter Logic...\n");

testCases.forEach((tc, i) => {
    const result = isRelevantJob(tc.title, tc.description);
    const passed = result === tc.expected;
    console.log(`Test ${i + 1}: "${tc.title}"`);
    console.log(`- Result: ${result ? 'ACCEPTED' : 'REJECTED'}`);
    console.log(`- Expected: ${tc.expected ? 'ACCEPTED' : 'REJECTED'}`);
    console.log(`- Status: ${passed ? '✅ PASSED' : '❌ FAILED'}\n`);
});
