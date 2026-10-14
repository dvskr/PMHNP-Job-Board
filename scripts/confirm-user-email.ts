/**
 * Manually mark one Supabase auth user's email as confirmed.
 *
 * For the support case where the confirmation mail is provably delivered but
 * the recipient's own mail system never surfaces it, so the person cannot
 * finish signing up through the normal loop.
 *
 *   npx tsx scripts/confirm-user-email.ts --email=someone@example.com
 *   npx tsx scripts/confirm-user-email.ts --email=... --apply
 *
 * Dry run by default. Prints the account's current state first, because
 * "already confirmed" and "no such account" are very different problems and
 * both look like "they cannot log in" from the outside.
 *
 * This only sets email_confirmed_at. It does not change a password, a role,
 * or anything in the application database: the UserProfile is still created
 * by ensure-profile on their first authenticated request, from the metadata
 * their signup recorded.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.PROD_SUPABASE_URL;
if (process.env.PROD_SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
/* eslint-enable @typescript-eslint/no-require-imports */

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];
  if (!arg) { console.error('need --email=<address>'); process.exit(1); }
  const email = arg.trim().toLowerCase();
  const apply = process.argv.includes('--apply');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('missing SUPABASE_URL or SERVICE_ROLE_KEY'); process.exit(1); }

  console.log(`supabase: ${url}`);
  console.log(`address:  ${email}`);
  console.log(`mode:     ${apply ? 'APPLY' : 'dry run'}\n`);

  const admin = createClient(url, key);

  // listUsers is paginated and there is no get-by-email, so walk until found.
  let found: { id: string; email?: string; email_confirmed_at?: string | null; created_at: string; last_sign_in_at?: string | null } | null = null;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error(`listUsers: ${error.message}`); process.exit(1); }
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) {
      found = {
        id: match.id,
        email: match.email,
        email_confirmed_at: match.email_confirmed_at ?? null,
        created_at: match.created_at,
        last_sign_in_at: match.last_sign_in_at ?? null,
      };
      break;
    }
    if (data.users.length < 1000) break;
  }

  if (!found) {
    console.log('No Supabase auth user for that address.');
    console.log('They never completed the signup form, so there is nothing to confirm.');
    return;
  }

  console.log('— auth user —');
  console.log(`  id                 ${found.id}`);
  console.log(`  created_at         ${found.created_at}`);
  console.log(`  last_sign_in_at    ${found.last_sign_in_at ?? '(never)'}`);
  console.log(`  email_confirmed_at ${found.email_confirmed_at ?? '(NOT CONFIRMED)'}`);

  if (found.email_confirmed_at) {
    console.log('\nAlready confirmed. Whatever is blocking them is not this.');
    return;
  }

  if (!apply) {
    console.log('\ndry run. re-run with --apply to confirm this address.');
    return;
  }

  const { data, error } = await admin.auth.admin.updateUserById(found.id, { email_confirm: true });
  if (error) { console.error(`\nupdateUserById: ${error.message}`); process.exit(1); }

  console.log(`\nconfirmed. email_confirmed_at = ${data.user?.email_confirmed_at ?? '(unknown)'}`);
  console.log('They can sign in with the password they set at signup.');
}

main().catch((e) => { console.error(e); process.exit(1); });
