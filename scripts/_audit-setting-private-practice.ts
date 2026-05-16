import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import('./_audit-setting-common')
  .then(({ runAuditSetting }) =>
    runAuditSetting({
      slug: 'private-practice',
      label: 'Private Practice',
      suspectTitle: [
        /\bhospital\b/i,
        /\bmedical center\b/i,
        /\bhealth system\b/i,
        /\bva\b/i,
        /\bdepartment of\b/i,
        /\bfqhc\b/i,
        /\bcorrectional\b/i,
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
        /\bmindpath\b/i,
        /\bteladoc\b/i,
        /\bhims\b/i,
        /\bsondermind\b/i,
        /\barray behavioral\b/i,
        /\bgenoa\b/i,
      ],
    }),
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
