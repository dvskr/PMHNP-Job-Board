const fs = require('fs');

// Each category gets 4 specific bento items
const bentoContent = {
  'community-health': [
    { title: 'Underserved Focus', desc: 'Serve vulnerable and underserved populations in community settings.' },
    { title: 'FQHC Settings', desc: 'Work in Federally Qualified Health Centers with loan repayment perks.' },
    { title: 'Integrated Care', desc: 'Collaborate with primary care teams for whole-person treatment.' },
    { title: 'Grant Funded', desc: 'Many positions backed by federal and state mental health grants.' },
  ],
  'contract': [
    { title: 'Flexible Terms', desc: 'Choose 3-12 month contract durations that fit your life.' },
    { title: 'Higher Rates', desc: 'Contract PMHNPs typically earn 15-30% more than permanent.' },
    { title: 'Diverse Settings', desc: 'Experience different clinical environments and patient populations.' },
    { title: 'Temp-to-Perm', desc: 'Many contracts convert to permanent positions if you find the right fit.' },
  ],
  'crisis': [
    { title: 'Rapid Response', desc: 'Provide acute psychiatric interventions in high-acuity environments.' },
    { title: 'Life-Saving Work', desc: 'De-escalate crises and prevent psychiatric emergencies.' },
    { title: 'Team-Based', desc: 'Work alongside ER physicians, social workers, and crisis counselors.' },
    { title: 'In Demand', desc: 'Crisis PMHNPs are critically needed as mental health emergencies rise.' },
  ],
  'entry-level': [
    { title: 'Mentorship', desc: 'Structured onboarding with experienced provider supervision.' },
    { title: 'Gradual Ramp', desc: 'Start with a manageable caseload that grows over 3-6 months.' },
    { title: 'Skill Building', desc: 'Develop diagnostic and prescribing confidence in supportive settings.' },
    { title: 'Certification', desc: 'Employers value your PMHNP-BC; experience is built on the job.' },
  ],
  'full-time': [
    { title: 'Full Benefits', desc: 'Health insurance, 401k, PTO, CME stipends, and loan repayment.' },
    { title: 'Job Security', desc: 'Permanent positions with stable income and career advancement.' },
    { title: 'Work-Life Balance', desc: 'Many full-time roles offer predictable M-F schedules.' },
    { title: 'Team Integration', desc: 'Become a core member of multidisciplinary care teams.' },
  ],
  'geriatric': [
    { title: 'Aging Population', desc: 'Growing demand as 10,000+ Americans turn 65 daily.' },
    { title: 'Memory Care', desc: 'Specialize in dementia, delirium, and late-life mood disorders.' },
    { title: 'Nursing Homes', desc: 'Work in long-term care, assisted living, and SNF facilities.' },
    { title: 'Polypharmacy', desc: 'Expert medication management for complex geriatric patients.' },
  ],
  'hospital': [
    { title: 'Acute Care', desc: 'Manage psychiatric emergencies and inpatient stabilization.' },
    { title: 'Top Pay', desc: 'Hospital-based PMHNPs earn premium salaries with shift differentials.' },
    { title: 'Team Support', desc: 'Collaborate with psychiatrists, RNs, and social workers.' },
    { title: 'Loan Forgiveness', desc: 'Many hospital systems qualify for PSLF loan repayment programs.' },
  ],
  'lgbtq': [
    { title: 'Affirming Care', desc: 'Provide culturally competent care for LGBTQ+ communities.' },
    { title: 'Gender Health', desc: 'Support gender-affirming treatment and mental health needs.' },
    { title: 'Inclusive Settings', desc: 'Work in organizations committed to equity and inclusion.' },
    { title: 'High Impact', desc: 'Address disparities in mental health care for marginalized communities.' },
  ],
  'mid-career': [
    { title: 'Leadership Roles', desc: 'Step into supervisory and program director positions.' },
    { title: 'Premium Salary', desc: 'Mid-career PMHNPs command $150K-$200K+ compensation.' },
    { title: 'Specialization', desc: 'Deepen expertise in forensic, addiction, or child psych niches.' },
    { title: 'Teaching', desc: 'Opportunities to precept students and mentor new graduates.' },
  ],
  'part-time': [
    { title: 'Flexible Hours', desc: 'Work 10-30 hours per week on your preferred schedule.' },
    { title: 'Side Income', desc: 'Supplement primary income or ease into retirement.' },
    { title: 'PRN Options', desc: 'Pick up shifts as needed with no minimum hour commitments.' },
    { title: 'Work-Life Balance', desc: 'Maintain clinical skills while prioritizing personal life.' },
  ],
  'private-practice': [
    { title: 'Autonomy', desc: 'Set your own schedule, rates, and clinical approach.' },
    { title: 'Highest Earning', desc: 'Private practice PMHNPs can earn $200K-$300K+.' },
    { title: 'Group Practice', desc: 'Join established groups with built-in referral networks.' },
    { title: 'Telehealth Hybrid', desc: 'Combine in-person and virtual sessions for flexibility.' },
  ],
  'senior': [
    { title: 'Executive Roles', desc: 'Chief PMHNP, clinical director, and VP positions.' },
    { title: 'Top Compensation', desc: 'Senior roles offer $180K-$250K+ with equity and bonuses.' },
    { title: 'Program Design', desc: 'Build and lead psychiatric programs from the ground up.' },
    { title: 'Industry Influence', desc: 'Shape mental health policy and best practices at scale.' },
  ],
  'veterans': [
    { title: 'Serve Heroes', desc: 'Treat PTSD, TBI, and combat-related mental health conditions.' },
    { title: 'Federal Benefits', desc: 'Federal pension, 13-26 PTO days, and 11 paid holidays.' },
    { title: 'PSLF Eligible', desc: 'Public Service Loan Forgiveness after 10 years of VA service.' },
    { title: 'Mission-Driven', desc: 'Honor military service by providing expert psychiatric care.' },
  ],
};

for (const [cat, items] of Object.entries(bentoContent)) {
  const file = `app/jobs/${cat}/page.tsx`;
  let c = fs.readFileSync(file, 'utf-8');
  
  // Find and replace the old bento grid content (4 span-6 cards → 4 span-3 cards)
  const oldBento = `<div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 6', padding: '28px 24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Specialized Care</h3>`;
  
  if (c.includes('Specialized Care')) {
    // Replace entire bento grid content
    const gridStart = c.indexOf("className=\"cat-bento-grid\"");
    const gridEnd = c.indexOf('</section>', gridStart);
    const gridClose = c.lastIndexOf('</div>', gridEnd);
    const gridOpenEnd = c.indexOf('>', c.indexOf('cat-bento-grid')) + 1;
    
    const newCards = items.map(item => 
      `\n            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>${item.title}</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>${item.desc}</p>
            </div>`
    ).join('');
    
    // Find the 4 old bento cards and replace them
    const bentoGridOpen = c.indexOf('<div className="cat-bento-grid"');
    const bentoGridClose = c.indexOf('</div>\n', c.indexOf('Career Growth', bentoGridOpen)) + 6;
    const afterGrid = c.indexOf('</div>', bentoGridClose);
    
    // Simpler approach: find the grid, extract just the cards
    const start = c.indexOf('Specialized Care');
    const end = c.indexOf('Career Growth');
    if (start > 0 && end > 0) {
      const lastCard = c.indexOf('</div>', c.indexOf('</p>', end));
      const lastCardEnd = c.indexOf('\n', lastCard + 6);
      const firstCardStart = c.lastIndexOf('<div', start);
      
      const oldSection = c.slice(firstCardStart, lastCardEnd + 1);
      c = c.replace(oldSection, newCards.trim());
      console.log(`${cat}: ✅ bento upgraded to 4 span-3 cards`);
    } else {
      console.log(`${cat}: ⚠️ could not locate bento cards`);
    }
  } else {
    console.log(`${cat}: no generic bento found`);
  }
  
  fs.writeFileSync(file, c);
}

console.log('\nAll bentos upgraded!');
