/**
 * Exact-host allow-list for auth redirect targets (today: the password-reset
 * `redirectTo` Supabase embeds in the email as `?next=`).
 *
 * History of the hole this closes, in two steps:
 *
 *   1. The original check accepted any host ending in `.vercel.app`. That
 *      suffix is third-party registrable, so an attacker could deploy their
 *      own page, ask for a reset of someone else's address with `redirectTo`
 *      pointing at it, and have the genuine reset email carry the victim
 *      there once the reset completed.
 *   2. The follow-up narrowed the suffix test to hosts starting with the
 *      project's own name prefix. Vercel hands `<project>.vercel.app` to
 *      whoever registers that project name first, in any account, so a
 *      prefixed name was still claimable by a stranger: the namespace got
 *      smaller, the hole stayed open.
 *
 * There is no prefix heuristic that fixes this, because the discriminator is
 * the deployment, not the name. Vercel already tells a running deployment
 * exactly which hosts are its own via VERCEL_URL (the immutable per-deploy
 * host) and VERCEL_BRANCH_URL (the git-branch alias), and the client only
 * ever asks to come back to its own origin. So the allow-list is built from
 * this deployment's own env-derived hosts and matched exactly: an attacker's
 * project host is never in it, whatever it is called.
 */
import { FIRST_PARTY_ORIGINS } from '@/lib/origins';

/**
 * Hosts that are ours on every deployment. `dev.` is the shared staging host;
 * loopback is here so local development can complete a reset.
 */
const STATIC_ALLOWED_HOSTS: readonly string[] = [
    'pmhnphiring.com',
    'www.pmhnphiring.com',
    'dev.pmhnphiring.com',
    'localhost',
    '127.0.0.1',
];

/** Hosts that may be reached over plain http, because they have no TLS. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/**
 * Accepts both full URLs (NEXT_PUBLIC_BASE_URL, FIRST_PARTY_ORIGINS) and the
 * bare `host[:port]` strings Vercel puts in VERCEL_URL and friends. Anything
 * unparseable is dropped rather than thrown: a malformed env var must degrade
 * to "one fewer allowed host", never to a broken password-reset endpoint.
 */
function toHostname(value: string | undefined | null): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    try {
        const host = new URL(withScheme).hostname.toLowerCase();
        return host || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Read fresh on every call rather than frozen at module load: the Vercel vars
 * differ per deployment, and a cached empty set from an import that happened
 * before the runtime env was populated would silently reject every legitimate
 * preview redirect.
 */
export function allowedRedirectHosts(): ReadonlySet<string> {
    const candidates: Array<string | undefined> = [
        ...STATIC_ALLOWED_HOSTS,
        ...FIRST_PARTY_ORIGINS,
        process.env.NEXT_PUBLIC_BASE_URL,
        // The deployment's own hosts. VERCEL_URL is the immutable per-deploy
        // host, VERCEL_BRANCH_URL the git-branch alias, and
        // VERCEL_PROJECT_PRODUCTION_URL the production domain.
        process.env.VERCEL_URL,
        process.env.VERCEL_BRANCH_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ];

    const hosts = new Set<string>();
    for (const candidate of candidates) {
        const host = toHostname(candidate);
        if (host) hosts.add(host);
    }
    return hosts;
}

/** True only for an exact host match against this deployment's allow-list. */
export function isAllowedRedirectHost(hostname: string): boolean {
    return allowedRedirectHosts().has(hostname.toLowerCase());
}

/**
 * Returns `raw` unchanged when it targets a first-party host, otherwise
 * undefined so the caller falls back to the provider's configured default.
 * Never throws.
 */
export function safeAuthRedirect(raw: string | undefined | null): string | undefined {
    if (!raw) return undefined;
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return undefined;
    }

    const hostname = parsed.hostname.toLowerCase();
    // A downgraded scheme on a real host is still an interception target, so
    // http is only tolerated on loopback.
    if (parsed.protocol !== 'https:' && !LOOPBACK_HOSTS.has(hostname)) return undefined;
    if (!isAllowedRedirectHost(hostname)) return undefined;
    return raw;
}
