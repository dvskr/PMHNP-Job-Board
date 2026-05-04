// Upload public/logo-cropped.png to Supabase email-assets bucket as logo-cropped.png
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.prod');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const SUPABASE_URL = env.PROD_SUPABASE_URL;
const KEY = env.PROD_SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'email-assets';
const FILE = path.join(__dirname, '..', 'public', 'logo-cropped.png');
const REMOTE = 'logo-cropped.png';

if (!SUPABASE_URL || !KEY) {
  console.error('Missing PROD_SUPABASE_URL or PROD_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

(async () => {
  const body = fs.readFileSync(FILE);
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${REMOTE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      apikey: KEY,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body,
  });
  const text = await res.text();
  console.log(`${res.status} ${res.statusText} → ${REMOTE} (${body.length} bytes)`);
  console.log(text);
  if (!res.ok) process.exit(1);
})();
