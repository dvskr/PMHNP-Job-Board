const fs = require('fs');
let c = fs.readFileSync('app/jobs/behavioral-health/page.tsx', 'utf-8');

// Replace ROW 2 Lucide icons with clay icon images
// Team-Based
c = c.replace(
  `<Heart size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Team-Based</h3>`,
  `<Image src="/images/categories/icon_bh_team.png" alt="Team collaboration" width={64} height={64} style={{ width: '64px', height: '64px', borderRadius: '12px', marginBottom: '10px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Team-Based</h3>`
);

// Diverse Settings
c = c.replace(
  `<Building2 size={32} style={{ color: '#8B5CF6', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Diverse Settings</h3>`,
  `<Image src="/images/categories/icon_bh_settings.png" alt="Healthcare settings" width={64} height={64} style={{ width: '64px', height: '64px', borderRadius: '12px', marginBottom: '10px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Diverse Settings</h3>`
);

// High Demand
c = c.replace(
  `<TrendingUp size={32} style={{ color: '#F97316', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>High Demand</h3>`,
  `<Image src="/images/categories/icon_bh_demand.png" alt="Growing demand" width={64} height={64} style={{ width: '64px', height: '64px', borderRadius: '12px', marginBottom: '10px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>High Demand</h3>`
);

// Preventive Focus
c = c.replace(
  `<Brain size={32} style={{ color: '#34D399', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Preventive Focus</h3>`,
  `<Image src="/images/categories/icon_bh_prevention.png" alt="Preventive care" width={64} height={64} style={{ width: '64px', height: '64px', borderRadius: '12px', marginBottom: '10px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Preventive Focus</h3>`
);

fs.writeFileSync('app/jobs/behavioral-health/page.tsx', c);
console.log('Swapped to clay icons');
