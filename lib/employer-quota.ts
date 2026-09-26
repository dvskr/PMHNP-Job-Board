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
  // ISP mailboxes. These were the widest hole in the exact-match list: they
  // are consumer addresses, so the free post was granted, AND the domain then
  // became a shared quota key, so the NEXT unrelated employer on the same ISP
  // was refused with "the domain comcast.net has already used its free post".
  'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net',
  'cox.net', 'charter.net', 'earthlink.net', 'optonline.net', 'juno.com',
  'roadrunner.com', 'rr.com', 'frontier.com', 'windstream.net',
  // Other consumer providers with no country-code family to key off.
  'tutanota.com', 'tuta.com', 'tutamail.com', 'hushmail.com', 'inbox.com',
  'mail.ru', 'qq.com', '163.com', '126.com', 'naver.com', 'daum.net',
  'seznam.cz', 'rediffmail.com', 'duck.com', 'pm.me', 'protonmail.ch',
  'aim.com', 'rocketmail.com', 'lycos.com', 'yopmail.com',
  // Non-English consumer portals whose brand word is an ordinary noun, so they
  // are listed exactly rather than added to CONSUMER_MAIL_BRANDS below: a real
  // employer could plausibly own "live.io" or "terra.com".
  'web.de', 'freenet.de', 'libero.it', 'virgilio.it', 'orange.fr',
  'laposte.net', 'wanadoo.fr', 'sfr.fr', 'wp.pl', 'onet.pl', 'interia.pl',
  'uol.com.br', 'bol.com.br', 'terra.com.br', 'sapo.pt', 'abv.bg',
  'live.com.au', 'live.co.uk', 'live.ca', 'live.nl', 'live.fr', 'live.de',
  'live.it', 'live.se', 'live.cn',
];

/**
 * Consumer mail brands that publish country-code variants of one mailbox
 * product: hotmail.co.uk, yahoo.co.uk, outlook.de, gmx.net, yandex.ru and so
 * on. Enumerating every TLD by hand is how the exact-match list fell behind;
 * matching the registrable base instead covers the whole family.
 *
 * Only distinctive brand words belong here. Anything that is also an ordinary
 * noun (live, web, orange, terra) stays in the exact list above, because a
 * real employer could own it. Matching is on the FIRST label only, never a
 * substring, so "yahoo-consulting.com" is untouched.
 */
const CONSUMER_MAIL_BRANDS: readonly string[] = [
  'gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook',
  'msn', 'aol', 'gmx', 'yandex', 'icloud', 'protonmail',
];

/**
 * True when the domain is a country-code variant of a consumer mail brand,
 * e.g. hotmail.co.uk, yahoo.com.au, gmx.de. Public-suffix labels are short and
 * alphabetic, which is what separates "yahoo.co.uk" from "yahoo-consulting.com"
 * or a real company that happens to start with a brand word.
 */
function isConsumerBrandVariant(domain: string): boolean {
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const [base, ...suffix] = labels;
  if (!CONSUMER_MAIL_BRANDS.includes(base)) return false;
  // At most two suffix labels ("co.uk", "com.au", "de"), each 2 to 3 letters.
  if (suffix.length > 2) return false;
  return suffix.every((part) => /^[a-z]{2,3}$/.test(part));
}

/** Session-proven identity. Nothing here comes from the posting form. */
export interface QuotaIdentity {
  /** Supabase auth id. Stable across email changes: the anti-reset anchor. */
  userId?: string | null;
  /** Current signup/account email, read from the session. */
  signupEmail?: string | null;
  /**
   * The account's WRITE-ONCE company name, loaded from UserProfile.company.
   *
   * CALLER CONTRACT, AND IT IS NOT NEGOTIABLE: populate this ONLY from the
   * authenticated profile row. Never from a request body, never from
   * `sanitized.employer`, never from anything the poster typed in this
   * request. A form-derived key is a weapon (see POISONING above), and that
   * is exactly the design this file already had to throw away once.
   *
   * Why an account attribute is different from form input: it is set once,
   * by an account that had to sign up with a non-consumer company address,
   * and after that only support can change it
   * (app/api/employer/settings/route.ts refuses the edit). So it cannot be
   * retyped per post to look like a fresh organization, which is the evasion
   * the org key closes: a returning employer who registers a brand new
   * account on a brand new domain still collides on the organization.
   *
   * RESIDUAL RISK, STATED PLAINLY RATHER THAN HIDDEN: the name is still
   * self-declared at signup. An attacker who signs up with their own
   * company-domain address can type a rival's company name and consume that
   * rival's lifetime free post. The bar is higher than the old design (needs
   * a non-consumer mailbox plus the exact name, and only burns ONE post), the
   * operator can reverse it from the admin Employers view, and generic names
   * are excluded below, but the vector is not zero. Accepted deliberately.
   */
  lockedCompanyName?: string | null;
}

/**
 * Names too generic to identify an organization. A key built from any of
 * these would refuse unrelated clinics their first free post, which costs
 * far more than missing an evader, so we emit NO key and fail open.
 * Compared after normalization.
 */
const GENERIC_ORG_NAMES: readonly string[] = [
  'psychiatry', 'psychiatric', 'mentalhealth', 'behavioralhealth', 'behavioral',
  'counseling', 'counselling', 'therapy', 'wellness', 'clinic', 'clinics',
  'health', 'healthcare', 'care', 'medical', 'medicine', 'practice',
  'psychnp', 'telehealth', 'telepsychiatry', 'nursing', 'services',
  'associates', 'partners', 'consulting', 'solutions',
  'test', 'testing', 'none', 'na', 'nil', 'null', 'unknown', 'private',
];

/** Shortest normalized name allowed to become a key. */
const MIN_ORG_KEY_LENGTH = 5;

/**
 * Normalize a company name for org matching. Deliberately CONSERVATIVE: a
 * normalizer that maps two genuinely different clinics onto one key is worse
 * than one that misses an evader, so this only lowercases, drops punctuation,
 * and strips legal suffixes and a leading "the". It does not stem, fuzzy
 * match, or drop descriptive words.
 */
export function normalizeOrgName(name: string | null | undefined): string | null {
  if (!name) return null;
  const LEGAL = new Set([
    'llc', 'l.l.c', 'inc', 'incorporated', 'pc', 'p.c', 'pllc', 'p.l.l.c',
    'plc', 'corp', 'corporation', 'co', 'ltd', 'limited', 'llp', 'lp', 'pa',
    'group', 'the',
  ]);
  const tokens = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !LEGAL.has(t));
  const joined = tokens.join('');
  if (!joined) return null;
  return joined;
}

/**
 * Org key for a locked company name, or null when the name must not block.
 * Null means the org rule simply does not apply to this poster: fail OPEN.
 */
export function orgKeyFromCompanyName(name: string | null | undefined): string | null {
  const normalized = normalizeOrgName(name);
  if (!normalized) return null;
  if (normalized.length < MIN_ORG_KEY_LENGTH) return null;
  if (GENERIC_ORG_NAMES.includes(normalized)) return null;
  return `org:${normalized}`;
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
  if (FREE_EMAIL_DOMAINS.includes(domain)) return null;
  if (isConsumerBrandVariant(domain)) return null;
  return domain;
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
  // org: from the account's write-once name. See the field docs on
  // QuotaIdentity for the caller contract and the accepted residual risk.
  push(orgKeyFromCompanyName(identity.lockedCompanyName));

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
  if (key.startsWith('org:')) return 'your organization';
  return 'a previous post';
}
