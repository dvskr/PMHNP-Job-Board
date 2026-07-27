/**
 * Free-post quota identity keys.
 *
 * WHY THIS EXISTS
 * The original gate keyed the lifetime free post off the signup email's
 * DOMAIN, read live from the session at post time. The stored snapshot was
 * immutable but the derivation was not: changing the account email domain
 * produced a different key and therefore a second free post. Seen in the
 * wild: one account, a support-side email change from one company domain to
 * another, two free posts.
 *
 * WHY ONLY VERIFIED SIGNALS BLOCK
 * A first version of this file also keyed on the form-submitted contact email,
 * company website, and employer name. Adversarial review killed that design on
 * two independent grounds, and it was right:
 *
 *   1. POISONING. Those fields are attacker controlled and unverified. Posting
 *      one free job with a rival's contact address or company name would
 *      permanently consume THEIR free post. A quota key must be something the
 *      poster proved they control.
 *   2. FALSE POSITIVES. Shared infrastructure makes those signals ambiguous:
 *      careers addresses on an ATS domain, sites on wixsite.com, and the very
 *      templated names in behavioral health ("Serenity Behavioral Health")
 *      would refuse unrelated clinics their first free post. Agencies posting
 *      for clients would stamp the client's identity onto the agency's row.
 *
 * And the name key did not even earn its cost: pluralize the name, prefix a
 * "The", or append a city and it sails past exact-token matching. It was
 * simultaneously evadable and harmful, so it is gone.
 *
 * WHAT BLOCKS NOW: the Supabase account id, and the signup email domain. Both
 * come from the session, so neither can be spoofed by form input. `acct:`
 * closes the real prod leak (email changes no longer reset the quota) and
 * `dom:` preserves the original one-free-post-per-company rule.
 *
 * A determined evader can still register a genuinely new company account with
 * a genuinely new domain. That is accepted deliberately: wrongly refusing one
 * real customer their free post costs far more than occasionally missing one
 * evader.
 */

/**
 * Consumer mailbox providers. Free posts require a company signup address, so
 * these are rejected outright rather than turned into a shared quota key that
 * would collide every unrelated employer. Single source of truth: the posting
 * route imports this instead of keeping its own copy.
 */
export const FREE_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'ymail.com', 'live.com',
  'msn.com', 'googlemail.com', 'proton.me', 'gmx.com', 'yandex.com',
  'zoho.com', 'hey.com', 'fastmail.com', 'me.com', 'mac.com',
];

/** Session-proven identity. Nothing here comes from the posting form. */
export interface QuotaIdentity {
  /** Supabase auth id. Stable across email changes: the anti-reset anchor. */
  userId?: string | null;
  /** Current signup/account email, read from the session. */
  signupEmail?: string | null;
}

/**
 * Normalized mail domain, or null for anything malformed. Does NOT screen
 * consumer providers: use this where the caller needs the domain AND its own
 * consumer check (the gate and the preview endpoint, which return a distinct
 * "free-email-provider" reason).
 *
 * This is THE domain derivation for the whole quota surface. The gate, the
 * preview endpoint, and the checkout guard once derived it independently
 * (raw split('@')[1] in two places, this module in one), and the edge cases
 * diverged: "user@gmail.com." raw-splits to "gmail.com.", sailing past the
 * exact-match consumer blocklist. One derivation, one behavior.
 */
export function rawDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = email.toLowerCase().trim().split('@');
  // Exactly one "@", and both sides non-empty.
  if (parts.length !== 2 || !parts[0].trim()) return null;
  const domain = parts[1].trim().replace(/\.+$/, '');
  if (!domain || !domain.includes('.')) return null;
  return domain;
}

/** Lowercased mail domain, or null for blanks and consumer providers. */
export function domainFromEmail(email: string | null | undefined): string | null {
  const domain = rawDomainFromEmail(email);
  if (!domain) return null;
  return FREE_EMAIL_DOMAINS.includes(domain) ? null : domain;
}

/**
 * Blocking keys for a poster. Order is stable and duplicates are removed so
 * the array can be stored and compared directly.
 *
 *   acct:<supabase user id>   defeats account email changes
 *   dom:<signup email domain> one free post per company, as originally intended
 */
export function buildQuotaKeys(identity: QuotaIdentity): string[] {
  const keys: string[] = [];
  const push = (k: string | null) => { if (k && !keys.includes(k)) keys.push(k); };

  if (identity.userId?.trim()) push(`acct:${identity.userId.trim().toLowerCase()}`);
  const domain = domainFromEmail(identity.signupEmail);
  if (domain) push(`dom:${domain}`);

  return keys;
}

/** True when two identities share any key, i.e. the same account or company. */
export function quotaKeysOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.some((k) => b.includes(k));
}

/** Human-readable reason for a refusal, for the 403 body and the log line. */
export function describeQuotaKey(key: string): string {
  if (key.startsWith('acct:')) return 'this account';
  if (key.startsWith('dom:')) return `the domain ${key.slice(4)}`;
  return 'a previous post';
}
