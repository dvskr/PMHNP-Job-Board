import { checkDuplicate } from '../lib/deduplicator'

async function test() {
  console.log('Testing deduplicator...\n')
  
  // Test 1: Exact match (should find duplicate)
  const result1 = await checkDuplicate({
    title: 'Remote PMHNP - Telehealth',
    employer: 'Talkiatry',
    location: 'Remote, United States',
    externalId: 'existing_id_from_db',
    sourceProvider: 'adzuna',
  })
  console.log('Test 1 (exact):', result1)
  
  // Test 2: Similar title (should catch fuzzy match)
  const result2 = await checkDuplicate({
    title: 'PMHNP - Remote Telehealth Position',
    employer: 'Talkiatry Inc',
    location: 'Remote',
  })
  console.log('Test 2 (fuzzy):', result2)
  
  // Test 3: Unique job (should not be duplicate)
  const result3 = await checkDuplicate({
    title: 'Completely Unique PMHNP Job Title XYZ123',
    employer: 'Brand New Company ABC',
    location: 'New York, NY',
  })
  console.log('Test 3 (unique):', result3)
}

test().catch(console.error)

