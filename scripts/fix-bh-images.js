const fs = require('fs');
let c = fs.readFileSync('app/jobs/behavioral-health/page.tsx', 'utf-8');

// ROW 1 left: Integrated Care → team collaboration image
c = c.replace(
  'bento_bh_integrated.png" alt="Integrated behavioral health clinic"',
  'bento_bh_collab.png" alt="Integrated care team collaboration"'
);

// ROW 1 right: Population Health → community image (already there)
c = c.replace(
  'bento_bh_community.png" alt="Community behavioral health"',
  'bento_bh_community.png" alt="Community behavioral health populations"'
);

// ROW 3: Career Growth → career growth image
c = c.replace(
  'bento_bh_integrated.png" alt="Behavioral health career growth"',
  'bento_bh_growth.png" alt="Behavioral health career advancement"'
);

fs.writeFileSync('app/jobs/behavioral-health/page.tsx', c);
console.log('BH images updated to contextual ones');
