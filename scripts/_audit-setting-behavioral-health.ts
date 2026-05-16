import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import('./_audit-setting-common')
  .then(({ runAuditSetting }) =>
    runAuditSetting({
      slug: 'behavioral-health',
      label: 'Behavioral Health',
      // The filter contains 'PMHNP' and 'psychiatric' - matches essentially
      // every job on a PMHNP board. Total-count ratio is the main signal.
      suspectTitle: [],
    }),
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
