// Compares the audit (raw filter) count vs what each /jobs/<slug>/page.tsx
// actually shows in its hero / H2 title. Only inpatient applies an extra
// { isRemote: { not: true } }; everything else uses the raw filter.
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import('./_audit-setting-common-pagecount')
  .then(({ run }) => run())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
