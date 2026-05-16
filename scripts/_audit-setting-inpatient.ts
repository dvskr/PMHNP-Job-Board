// Must run dotenv BEFORE statically importing the common module (which
// transitively imports @/lib/prisma — top-level imports are hoisted).
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import('./_audit-setting-common')
  .then(({ runAuditSetting }) =>
    runAuditSetting({
      slug: 'inpatient',
      label: 'Inpatient',
      suspectTitle: [
        /\boutpatient\b/i,
        /\bclinic\b/i,
        /\bambulatory\b/i,
        /\btelehealth\b/i,
        /\btelepsych/i,
        /\bvirtual\b/i,
        /\bremote\b/i,
        /\bhome[-\s]?based\b/i,
        /\bfqhc\b/i,
        /\bprivate practice\b/i,
      ],
      flagRemote: true,
    }),
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
