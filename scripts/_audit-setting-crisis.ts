import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import('./_audit-setting-common')
  .then(({ runAuditSetting }) =>
    runAuditSetting({
      slug: 'crisis',
      label: 'Crisis',
      // The filter matches "urgent" - sweeps in "urgent care", "urgent hire",
      // "urgently needed", etc. that have nothing to do with crisis/ED.
      suspectTitle: [
        /\burgent\s+hire\b/i,
        /\burgently\b/i,
        /\burgent\s+need/i,
        /\burgent\s+care\b/i,
        /\burgent\s+opening\b/i,
        /\bimmediate(ly)?\s+(hire|need|opening)/i,
        /\boutpatient\b/i,
        /\bclinic\b/i,
        /\btelehealth\b/i,
        /\btelepsych/i,
      ],
    }),
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
