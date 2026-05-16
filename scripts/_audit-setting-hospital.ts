import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import('./_audit-setting-common')
  .then(({ runAuditSetting }) =>
    runAuditSetting({
      slug: 'hospital',
      label: 'Hospital',
      suspectTitle: [
        /\boutpatient\b/i,
        /\bclinic\b/i,
        /\bambulatory\b/i,
        /\btelehealth\b/i,
        /\btelepsych/i,
        /\bvirtual\b/i,
        /\bremote\b/i,
        /\bfqhc\b/i,
        /\bcommunity (mental|behavioral)\b/i,
        /\bprivate practice\b/i,
        /\bschool[-\s]based\b/i,
      ],
      suspectEmployer: [
        /\btalkiatry\b/i,
        /\btalkspace\b/i,
        /\bcerebral\b/i,
        /\bbrightside\b/i,
        /\bgrow therapy\b/i,
        /\bheadway\b/i,
        /\brula\b/i,
        /\bspring health\b/i,
        /\blifestance\b/i,
      ],
      flagRemote: true,
    }),
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
