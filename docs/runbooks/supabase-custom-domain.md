# Runbook: Supabase Custom Domain

Moves the production Supabase endpoints from `<ref>.supabase.co` to a branded
host (recommended: `api.pmhnphiring.com`).

The visible win is Google sign-in: the OAuth consent screen currently shows a
raw `<ref>.supabase.co` URL to candidates. It also keeps the API portable, so a
future project migration is a DNS change rather than a client-code change.

## What changes, and what does not

| Surface | Effect |
| --- | --- |
| Auth (`/auth/v1/*`), REST, Storage, Edge Functions | Served from the custom domain once activated |
| Google OAuth callback | Supabase advertises the custom domain **immediately** on activation |
| Default `<ref>.supabase.co` domain | Keeps serving; existing stored URLs do not break |
| `DATABASE_URL` / `DIRECT_URL` | **Unaffected.** Custom domains do not cover the Postgres connection string; leave both alone |
| CSP, `next/image` allowlist, résumé-URL validation | Derived from env by `lib/supabase/origins.ts`; no code edit needed |

## Prerequisites

- Supabase org on a paid plan, plus the Custom Domain add-on enabled for the
  production project (paid; see Supabase pricing).
- Access to DNS for `pmhnphiring.com`. It is hosted at **GoDaddy**
  (`ns25/ns26.domaincontrol.com`).
- Owner or Admin on the Supabase project.
- Access to the Google Cloud Console OAuth client used for Google sign-in.

## 1. Enable the add-on

Supabase Dashboard, production project, Settings, General, Custom Domains.
The dashboard flow is the path of least resistance here: DNS records have to be
entered by hand at GoDaddy either way, and the CLI route additionally needs a
personal access token (`supabase login`, which is interactive).

CLI equivalent, if preferred:

```bash
npm install --save-dev supabase
npx supabase domains create --project-ref <prod-ref> --custom-hostname api.pmhnphiring.com
```

## 2. Add the DNS records at GoDaddy

The dashboard shows a CNAME target and one `_acme-challenge` TXT value. Enter
them in GoDaddy under Domains, `pmhnphiring.com`, DNS, Add Record.

> **GoDaddy gotcha:** the Name field takes the subdomain *only* — GoDaddy
> appends `pmhnphiring.com` itself. Enter `api`, not `api.pmhnphiring.com`,
> otherwise you create `api.pmhnphiring.com.pmhnphiring.com`.

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `api` | `<prod-ref>.supabase.co` | 600 (low, so mistakes are cheap) |
| TXT | `_acme-challenge.api` | value from the dashboard | 600 |

Trim surrounding whitespace from the TXT value.

## 3. Verify

Re-run verification in the dashboard (or `npx supabase domains reverify
--project-ref <prod-ref>`). It may take several attempts while DNS propagates,
and certificate issuance can take up to ~30 minutes.

Check propagation independently before retrying:

```bash
nslookup -type=CNAME api.pmhnphiring.com
nslookup -type=TXT _acme-challenge.api.pmhnphiring.com
```

## 4. Before activating: update Google OAuth (blocking)

Activation switches the Auth callback immediately. If the redirect URI is not
already registered, **Google sign-in breaks in production the moment you
activate.**

In Google Cloud Console, on the OAuth client used by
`components/auth/GoogleSignInButton.tsx`, add to Authorized redirect URIs:

```
https://api.pmhnphiring.com/auth/v1/callback
```

Keep the existing `https://<prod-ref>.supabase.co/auth/v1/callback` entry —
both should be present so the switch and any rollback are non-breaking.

There is no SAML IdP and no `signInWithOtp` magic-link flow in this app, so the
other pre-activation items in the Supabase docs do not apply.

## 5. Activate

Dashboard Activate button, or:

```bash
npx supabase domains activate --project-ref <prod-ref>
```

## 6. Point the app at the new host

In Vercel (Production scope), set:

```
NEXT_PUBLIC_SUPABASE_URL=https://api.pmhnphiring.com
```

Then redeploy — `NEXT_PUBLIC_*` values are inlined at build time, so an env
change alone does nothing until a new build runs.

Optional, only if you also want asset URLs branded:

```
NEXT_PUBLIC_ASSET_BASE_URL=https://api.pmhnphiring.com/storage/v1/object/public
```

Leave `PROD_SUPABASE_URL` and `E2E_SUPABASE_URL` on the default domain unless
there is a reason to move them; both keep working either way.

## 7. Verify in production

- Sign in with Google end to end.
- Sign in with email/password, then confirm the session survives a reload.
- Load a page with Supabase-hosted imagery — a broken image here means the
  `next/image` allowlist did not pick up the host (check the deploy actually
  rebuilt).
- Open DevTools Console on any page and confirm there are no CSP violations for
  `api.pmhnphiring.com`.
- Upload a résumé, then submit an application via the in-platform apply flow —
  this exercises the storage-URL validation in
  `app/api/applications/apply-direct/route.ts`.
- Confirm a password-reset email still links correctly.

## Rollback

Set `NEXT_PUBLIC_SUPABASE_URL` back to `https://<prod-ref>.supabase.co` and
redeploy. The default domain never stops serving, so this is immediate and does
not require touching DNS or the add-on.

> **One caveat before activating.** Once the app is live on the custom domain,
> new uploads write custom-domain URLs into the database (résumés, company
> logos, message attachments). Reverting the env var is safe — those URLs still
> resolve — but *deleting the custom domain* would break them permanently.
> Treat domain deletion as a migration, not a rollback.
