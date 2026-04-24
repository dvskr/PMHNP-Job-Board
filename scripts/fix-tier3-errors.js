const fs = require('fs');

const pages = [
  { file: 'app/jobs/child-adolescent/page.tsx', faqVar: 'childFaqs', faqData: [
    { q: 'What is a Child & Adolescent PMHNP?', a: 'A PMHNP specializing in diagnosing and treating psychiatric disorders in children, teens, and young adults aged 0-21.' },
    { q: 'What conditions do they treat?', a: 'ADHD, anxiety, depression, autism spectrum disorders, behavioral disorders, eating disorders, and trauma-related conditions.' },
    { q: 'What is the salary range?', a: 'Child & adolescent PMHNPs earn $120K-$180K annually, with school-based and private practice roles at the higher end.' },
    { q: 'Is family involvement required?', a: 'Yes, family therapy and parental counseling are core components of child/adolescent psychiatric care.' },
  ]},
  { file: 'app/jobs/new-grad/page.tsx', faqVar: 'newGradFaqs', faqData: [
    { q: 'Can new grads get PMHNP jobs?', a: 'Yes! Many employers actively recruit new PMHNP graduates, especially in underserved areas and community health settings.' },
    { q: 'What should new grads expect?', a: 'Structured onboarding, clinical supervision, mentorship programs, and gradual caseload increase over 3-6 months.' },
    { q: 'What is the starting salary?', a: 'New grad PMHNPs typically start at $100K-$140K, with rapid increases after the first year of experience.' },
    { q: 'Do I need experience to apply?', a: 'Clinical rotation hours count as experience. Highlight any psychiatric nursing background and relevant certifications.' },
  ]},
  { file: 'app/jobs/substance-abuse/page.tsx', faqVar: 'substanceFaqs', faqData: [
    { q: 'What is a Substance Abuse PMHNP?', a: 'A PMHNP specializing in addiction treatment, including medication-assisted treatment (MAT), detox management, and dual-diagnosis care.' },
    { q: 'What is MAT?', a: 'Medication-Assisted Treatment uses FDA-approved medications like buprenorphine and naltrexone alongside counseling to treat opioid and alcohol use disorders.' },
    { q: 'What is the salary range?', a: 'Substance abuse PMHNPs earn $130K-$180K, with MAT-certified providers commanding premium rates.' },
    { q: 'What certifications help?', a: 'DEA registration, buprenorphine prescribing knowledge, and ASAM certification strengthen candidacy for addiction roles.' },
  ]},
  { file: 'app/jobs/travel/page.tsx', faqVar: 'travelFaqs', faqData: [
    { q: 'What is a Travel PMHNP?', a: 'A PMHNP who takes temporary assignments (8-26 weeks) at healthcare facilities across the country through staffing agencies.' },
    { q: 'What is the pay like?', a: 'Travel PMHNPs earn 20-50% more than permanent roles, plus tax-free housing stipends, travel reimbursement, and completion bonuses.' },
    { q: 'Is housing provided?', a: 'Yes, most agencies offer furnished housing or generous housing stipends. Meals and incidental per diems are also common.' },
    { q: 'Do I need multi-state licenses?', a: 'You need licensure in each state you work in. Many agencies assist with licensure and the Nurse Licensure Compact helps.' },
  ]},
];

for (const { file, faqVar, faqData } of pages) {
  let c = fs.readFileSync(file, 'utf-8');
  
  // Add ArrowRight to imports
  if (!c.includes('ArrowRight')) {
    c = c.replace("from 'lucide-react';", ", ArrowRight } from 'lucide-react';");
    console.log(`  ${file}: added ArrowRight`);
  }
  
  // Add FAQ data before the export async function generateMetadata
  if (!c.includes(`const ${faqVar}`)) {
    const faqCode = `\nconst ${faqVar} = [\n${faqData.map(f => `  { question: '${f.q}', answer: '${f.a}' },`).join('\n')}\n];\n`;
    c = c.replace('export async function generateMetadata', faqCode + '\nexport async function generateMetadata');
    console.log(`  ${file}: added ${faqVar}`);
  }
  
  fs.writeFileSync(file, c);
}

console.log('All fixes applied');
