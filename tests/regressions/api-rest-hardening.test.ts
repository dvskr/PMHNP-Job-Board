/**
 * Static locks for the api-rest cluster fixes (2026-09-26).
 *
 * These are source assertions rather than live requests: every claim below is
 * about a control that must be PRESENT in a handler, and a handler that stops
 * calling it is exactly the regression these guard. The behaviours themselves
 * need a database, Stripe and an LLM, none of which belong in a unit run.
 *
 * The one thing tested for real is readJsonBody, because it is pure.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { readJsonBody } from '../../app/api/_lib/json-body';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Strip // and block comments so a mention in prose never satisfies an assertion. */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('readJsonBody separates a bad body from a broken handler', () => {
  const post = (body: BodyInit | null, contentType = 'application/json') =>
    new Request('https://example.test/api/x', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    });

  it('returns 400 for a body that is not JSON', async () => {
    const result = await readJsonBody(post('{bad'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('returns 400 for a text/plain body', async () => {
    const result = await readJsonBody(post('email=x', 'text/plain'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('returns 400 for an empty body', async () => {
    const result = await readJsonBody(post(null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('returns 400 for valid JSON that is not an object', async () => {
    for (const literal of ['null', '"x"', '3', '[1,2]']) {
      const result = await readJsonBody(post(literal));
      expect(result.ok, `body ${literal}`).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(400);
    }
  });

  it('accepts a JSON object', async () => {
    const result = await readJsonBody(post('{"email":"a@b.co"}'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.email).toBe('a@b.co');
  });
});

describe('public write routes parse the body before the 500 catch', () => {
  // Every route here answered 500 to `{bad` or a text/plain body, because
  // request.json() was awaited inside the try whose catch maps to 500.
  const ROUTES = [
    'app/api/contact/route.ts',
    'app/api/newsletter/route.ts',
    'app/api/job-alerts/route.ts',
    'app/api/job-alerts/[token]/route.ts',
    'app/api/feedback/route.ts',
    'app/api/salary-guide/route.ts',
    'app/api/email-job/route.ts',
    'app/api/create-checkout/route.ts',
    'app/api/push-subscribe/route.ts',
    'app/api/email/preferences/route.ts',
    'app/api/email/unsubscribe/route.ts',
    'app/api/candidate-profile/route.ts',
    'app/api/conversations/[id]/route.ts',
    'app/api/conversations/[id]/messages/[messageId]/edit/route.ts',
    'app/api/autofill/generate-answer/route.ts',
    'app/api/autofill/generate-cover-letter/route.ts',
    'app/api/blog/route.ts',
  ];

  for (const route of ROUTES) {
    it(`${route} uses readJsonBody`, () => {
      const src = code(route);
      expect(src).toContain('readJsonBody');
      expect(src, 'raw request.json() left in a handler').not.toMatch(
        /await\s+(request|req)\.json\(\)/,
      );
    });
  }
});

describe('numeric query params cannot reach Prisma as NaN', () => {
  it('/api/companies guards the limit clamp with Number.isFinite', () => {
    const src = code('app/api/companies/route.ts');
    // Math.max(NaN, 1) is NaN, so the clamp alone never bounded anything.
    expect(src).toMatch(/Number\.isFinite\(limit\)/);
  });

  it('/api/analytics/clicks guards the days range check', () => {
    const src = code('app/api/analytics/clicks/route.ts');
    expect(src).toMatch(/!Number\.isFinite\(days\)\s*\|\|/);
  });
});

describe('admin-only data sources are not anonymous', () => {
  it('/api/pseo/health requires an admin session', () => {
    const src = code('app/api/pseo/health/route.ts');
    expect(src).toContain('requireApiAdmin');
    // An auth-gated route cannot also be statically revalidated.
    expect(src).not.toMatch(/export const revalidate/);
  });
});

describe('newsletter opt-out proves ownership', () => {
  it('POST /api/newsletter refuses an anonymous optIn:false', () => {
    const src = code('app/api/newsletter/route.ts');
    expect(src).toMatch(/if \(!optIn && !\(await ownsEmail\(/);
    expect(src).toMatch(/status: 403/);
  });
});

describe('every message write path carries the same controls', () => {
  const SEND = 'app/api/conversations/[id]/route.ts';
  const EDIT = 'app/api/conversations/[id]/messages/[messageId]/edit/route.ts';
  const DELETE_MSG = 'app/api/conversations/[id]/messages/[messageId]/route.ts';

  it('the edit handler matches the send handler: csrf, rate limit, cap, sanitize', () => {
    const src = code(EDIT);
    expect(src).toContain('verifyCsrf');
    expect(src).toContain('rateLimit');
    expect(src).toContain('sanitizeText');
    expect(src).toMatch(/MESSAGE_MAX_LENGTH/);
    expect(src, 'raw body.trim() write').not.toMatch(/body:\s*body\.trim\(\)/);
  });

  it('message delete and conversation delete check the origin', () => {
    expect(code(DELETE_MSG)).toContain('verifyCsrf');
    // Two call sites in the send file: POST reply and DELETE conversation.
    const sendSrc = code(SEND);
    expect(sendSrc.match(/verifyCsrf\(req\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('an attachment path from the body is checked against the sender', () => {
    const src = code(SEND);
    // mintDocReadUrl signs with the service-role key and performs no ownership
    // check of its own, so the route must gate the path it stores.
    expect(src).toMatch(/isOwnDocPath\(attachmentUrl, 'message_attachment', user\.id\)/);
  });
});

describe('every mutating profile sub-resource checks the origin', () => {
  const PROFILE_DIR = path.join(ROOT, 'app', 'api', 'profile');

  function routeFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...routeFiles(full));
      else if (entry.name === 'route.ts') out.push(full);
    }
    return out;
  }

  for (const file of routeFiles(PROFILE_DIR)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const src = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const handlers = [...src.matchAll(/export async function (POST|PUT|DELETE|PATCH)\b/g)];

    if (handlers.length === 0) continue;

    it(`${rel} calls verifyCsrf once per mutating handler`, () => {
      const guards = src.match(/verifyCsrf\(/g)?.length ?? 0;
      expect(guards, `${handlers.length} mutating handler(s)`).toBe(handlers.length);
    });
  }
});

describe('the blog API guards both handlers the same way', () => {
  it('PATCH is timing-safe, rate-limited and does not echo backend errors', () => {
    const src = code('app/api/blog/route.ts');
    expect(src, 'plain !== compare of the shared key').not.toMatch(/providedKey !== apiKey/);
    // One shared constant-time check, used by POST and PATCH.
    expect(src.match(/verifyBlogApiKey\(request\)/g)?.length ?? 0).toBe(2);
    expect(src.match(/'blog-api'/g)?.length ?? 0).toBe(2);
    expect(src, 'raw error.message returned to the caller').not.toMatch(
      /NextResponse\.json\(\{ error: message \}/,
    );
  });

  it('PATCH validates the columns it writes', () => {
    const src = code('app/api/blog/route.ts');
    expect(src).toMatch(/YOUTUBE_ID\.test\(youtube_video_id\)/);
    expect(src).toMatch(/isHttpUrl\(image_url\)/);
  });
});

describe('OG cards do not assert facts the job does not have', () => {
  const OG = 'app/api/og/route.tsx';

  it('omits the schedule chip when the caller passed no jobType', () => {
    const src = code(OG);
    expect(src, "'Full-time' default resurrected").not.toMatch(
      /searchParams\.get\('jobType'\) \|\| 'Full-time'/,
    );
    expect(src).toMatch(/\{jobType && chip\(jobType\)\}/);
  });

  it('labels the recency badge as New, not Featured', () => {
    // isNew is set from createdAt under 7 days. "Featured" is a paid and
    // editorial placement on this board, so the badge must not claim it.
    expect(read(OG)).not.toMatch(/>\s*Featured\s*</);
  });

  it('neither OG route fetches the logo over the network', () => {
    for (const f of ['app/api/og/route.tsx', 'app/api/og/city/route.tsx']) {
      expect(code(f), f).not.toMatch(/fetch\(\s*'https:\/\/pmhnphiring\.com/);
      expect(code(f), f).toContain('LOGO_DATA_URI');
    }
  });

  it('the inlined logo still matches public/pmhnp_logo.png', () => {
    const onDisk = fs.readFileSync(path.join(ROOT, 'public', 'pmhnp_logo.png')).toString('base64');
    expect(read('app/api/og/_logo.ts')).toContain(onDisk);
  });
});

describe('job alerts report creation and mail delivery separately', () => {
  it('a failed welcome email does not become "Failed to create job alert"', () => {
    const src = code('app/api/job-alerts/route.ts');
    expect(src).toMatch(/try \{[\s\S]{0,400}await sendWelcomeEmail\([\s\S]{0,400}\} catch \(emailError\)/);
  });
});

describe('a stale Stripe session is a client error, not a server one', () => {
  for (const f of [
    'app/api/verify-renewal-session/route.ts',
    'app/api/verify-checkout-session/route.ts',
  ]) {
    it(`${f} maps an unknown session id to 404`, () => {
      const src = code(f);
      expect(src).toContain('retrieveSessionOrNull');
      expect(src).toMatch(/StripeInvalidRequestError|resource_missing/);
      expect(src, 'retrieve still called bare inside the 500 catch').not.toMatch(
        /await stripe\.checkout\.sessions\.retrieve\(sessionId\)(?![\s\S]{0,200}catch)/,
      );
    });
  }

  it('renewal verification reports the real expiry and whether the webhook landed', () => {
    const src = code('app/api/verify-renewal-session/route.ts');
    expect(src).toMatch(/processing: !charge/);
    expect(src).toMatch(/expiresAt/);
    // Stored slug, not a recomputed one: the canonical URL is the stored one.
    expect(src).toMatch(/employerJob\.job\.slug \|\| slugify\(/);
  });
});

describe('sitemaps advertise exactly what the listings show', () => {
  it('the job batch route excludes off-specialty rows', () => {
    const src = code('app/api/sitemaps/jobs/[batch]/route.ts');
    expect(src).toContain('GLOBAL_EXCLUSIONS');
    expect(src).toMatch(/NOT: exclusion/);
  });

  it('the index counts job batches with the same predicate', () => {
    const src = code('app/api/sitemaps/index/route.ts');
    expect(src).toContain('GLOBAL_EXCLUSIONS');
  });

  it('no city batches are advertised when no city URLs qualify', () => {
    const src = code('app/api/sitemaps/index/route.ts');
    expect(src, 'Math.max(1, ...) always advertised cities/0').not.toMatch(
      /Math\.max\(1, Math\.ceil\(totalUrls/,
    );
    expect(src).toMatch(/totalUrls > 0 \? Math\.ceil\(totalUrls/);
  });

  it('the city batch route 404s instead of serving an empty urlset', () => {
    const src = code('app/api/sitemaps/cities/[batch]/route.ts');
    expect(src).not.toMatch(/Math\.ceil\(allUrls\.length \/ BATCH_SIZE\) \|\| 1/);
    expect(src).toMatch(/totalBatches === 0 \|\| batchIndex >= totalBatches/);
  });
});

describe('autofill treats scraped page text as data', () => {
  it('generate-answer only reuses a stored answer for the same question', () => {
    const src = code('app/api/autofill/generate-answer/route.ts');
    expect(src, 'first-30-chars substring match resurrected').not.toMatch(
      /\.includes\(questionText\.toLowerCase\(\)\.substring/,
    );
    expect(src).toMatch(/normalizeQuestion\(r\.questionText\) === askedNormalized/);
  });

  it('generate-answer validates the body and clamps the token budget', () => {
    const src = code('app/api/autofill/generate-answer/route.ts');
    expect(src).toContain('bodySchema.safeParse');
    expect(src).toMatch(/clampAnswerLength/);
  });

  it('both autofill prompts fence untrusted text and say so in the system prompt', () => {
    for (const f of [
      'app/api/autofill/generate-answer/route.ts',
      'app/api/autofill/generate-cover-letter/route.ts',
    ]) {
      const src = read(f);
      expect(src, f).toContain('fenced(');
      expect(src, f).toMatch(/DATA, never instructions/);
    }
  });
});

describe('opt-out endpoints are throttled and not stamped by machines', () => {
  it('GET /api/email/unsubscribe is rate limited like its POST sibling', () => {
    const src = code('app/api/email/unsubscribe/route.ts');
    expect(src.match(/rateLimit\(request, 'email-unsub'/g)?.length ?? 0).toBe(2);
  });

  it('the email click tracker does not stamp prefetchers and scanners', () => {
    const src = code('app/api/track/email-click/route.ts');
    expect(src).toContain('isMachineFetch');
    expect(src).toMatch(/!isMachineFetch\(request\)/);
  });
});

describe('the legacy candidate-profile route validates and updates partially', () => {
  const F = 'app/api/candidate-profile/route.ts';

  it('sanitizes the fields it writes', () => {
    const src = code(F);
    expect(src).toContain('sanitizeUrl');
    expect(src).toContain('sanitizeText');
    expect(src).toContain('verifyCsrf');
  });

  it('no longer nulls every column the body omitted', () => {
    const src = code(F);
    for (const field of ['phone', 'city', 'state', 'zipCode', 'npiNumber', 'bio', 'headline']) {
      expect(src, `${field} still written as "|| null"`).not.toMatch(
        new RegExp(`${field}:\\s*${field} \\|\\| null`),
      );
    }
    expect(src).toMatch(/optionalText\(body\.phone/);
  });
});
