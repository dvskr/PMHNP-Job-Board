/**
 * Regressions for the seeker account surface: /settings, /saved, /messages,
 * /signup, /my-applications, /job-alerts, /auth/confirm and the auth and
 * settings components behind them.
 *
 * Source assertions rather than a rendered page: every one of these routes
 * needs a live Supabase session and a database, and these are the exact lines
 * that regressed. A stronger test that cannot run in CI catches nothing.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Same source with block and line comments blanked. A "do not do X" assertion
 * has to ignore the engineering note explaining why X was removed, or the note
 * keeps the test red on its own.
 */
const readCode = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const SETTINGS = 'app/settings/page.tsx';
const SAVED = 'app/saved/page.tsx';
const MESSAGES = 'app/messages/page.tsx';
const MY_APPS = 'app/my-applications/page.tsx';
const CONFIRM = 'app/auth/confirm/page.tsx';
const SIGNUP = 'app/signup/page.tsx';
const JOB_ALERTS = 'app/job-alerts/page.tsx';
const UNSUBSCRIBE = 'app/job-alerts/unsubscribe/page.tsx';
const LOGIN_CONTENT = 'components/auth/LoginContent.tsx';
const SIGNUP_FORM = 'components/auth/SignUpForm.tsx';
const HEADER_AUTH = 'components/auth/HeaderAuth.tsx';
const AUTH_TOKENS = 'components/auth/authTokens.ts';
const NEWSLETTER = 'components/settings/NewsletterPreference.tsx';
const SCREENING = 'components/settings/ScreeningAnswersSection.tsx';
const OPEN_ENDED = 'components/settings/OpenEndedResponsesSection.tsx';
const SETTINGS_TABS = 'components/settings/SettingsTabs.tsx';
const PROFILE_ROUTE = 'app/api/auth/profile/route.ts';
const DELETE_ROUTE = 'app/api/auth/delete-account/route.ts';

/** Every owned client surface, for the sweeps that apply to all of them. */
const ACCOUNT_SURFACES = [
  SETTINGS, SAVED, MESSAGES, MY_APPS, SIGNUP, JOB_ALERTS, UNSUBSCRIBE,
  LOGIN_CONTENT, SIGNUP_FORM, HEADER_AUTH, AUTH_TOKENS, NEWSLETTER,
  SCREENING, OPEN_ENDED, SETTINGS_TABS,
  'components/settings/EducationSection.tsx',
  'components/settings/WorkExperienceSection.tsx',
  'components/settings/LicensesSection.tsx',
  'components/settings/CertificationsSection.tsx',
  'components/settings/ReferencesSection.tsx',
  'components/auth/AuthLayout.tsx',
  'components/auth/UserMenu.tsx',
];

describe('delete-account copy matches the soft-delete it actually performs', () => {
  it('quotes the same grace window the route enforces', () => {
    const route = read(DELETE_ROUTE);
    const graceDays = route.match(/PURGE_GRACE_DAYS\s*=\s*(\d+)/)?.[1];
    expect(graceDays).toBeTruthy();

    const settings = read(SETTINGS);
    // Both the Danger Zone blurb and the confirmation modal have to name the
    // window. Two mentions, not one.
    const mentions = settings.match(new RegExp(`${graceDays} days`, 'g')) ?? [];
    expect(mentions.length).toBeGreaterThanOrEqual(2);
  });

  it('never claims deletion is irreversible', () => {
    const settings = readCode(SETTINGS);
    expect(settings).not.toMatch(/there is no going back/i);
    expect(settings).not.toMatch(/cannot be undone/i);
  });
});

describe('settings saves report honestly and carry every edited field', () => {
  it('the avatar patch checks res.ok and restores the previous value on failure', () => {
    const src = readCode(SETTINGS);
    const patch = src.slice(src.indexOf('const patchAvatar'), src.indexOf('const handleAvatarUpload'));
    expect(patch).toContain('if (!res.ok)');
    expect(patch).toContain('avatarUrl: previous');
  });

  it('the Per Hour / Per Year toggle is sent with the rest of the profile', () => {
    // The toggle only ever touched local state, so an hourly expectation was
    // stored without its rate type and read back as an annual salary.
    expect(readCode(SETTINGS)).toContain('desiredSalaryType: profile.desiredSalaryType');
  });

  it('never PATCHes resumeUrl, which the route refuses', () => {
    expect(readCode(SETTINGS)).not.toMatch(/resumeUrl:\s*profile\.resumeUrl/);
  });

  it('the professional-summary limit in the UI equals the server cap', () => {
    const cap = read(PROFILE_ROUTE).match(/BIO_MAX_LENGTH\s*=\s*(\d+)/)?.[1];
    expect(cap).toBeTruthy();
    const settings = readCode(SETTINGS);
    expect(settings).toContain(`e.target.value.length <= ${cap}`);
    expect(settings).toContain(`/${cap}`);
  });

  it('caps the name inputs client-side at the same length the server stores', () => {
    const cap = read(PROFILE_ROUTE).match(/sanitizeText\(body\.firstName,\s*(\d+)\)/)?.[1]
      ?? read(PROFILE_ROUTE).match(/NAME_MAX_LENGTH\s*=\s*(\d+)/)?.[1];
    expect(cap).toBeTruthy();
    expect(readCode(SETTINGS)).toContain('maxLength={NAME_MAX_LENGTH}');
  });
});

describe('gated pages hand the login page a return target it actually reads', () => {
  it('LoginContent reads redirectTo or next', () => {
    const src = readCode(LOGIN_CONTENT);
    expect(src).toContain("searchParams.get('redirectTo')");
    expect(src).toContain("searchParams.get('next')");
  });

  it.each([
    [SETTINGS, '/settings'],
    [MESSAGES, '/messages'],
  ])('%s pushes a login URL carrying its own path', (file, target) => {
    const src = readCode(file);
    expect(src).toContain(`/login?redirectTo=${target}`);
    // ?redirect= looked implemented but LoginContent never read it.
    expect(src).not.toContain(`/login?redirect=${target}`);
  });
});

describe('/auth/confirm only claims success when the email really was confirmed', () => {
  it('reserves the success copy for a missing PKCE verifier', () => {
    const src = readCode(CONFIRM);
    expect(src).toContain('pkce_code_verifier_not_found');
    expect(src).toContain('AuthPKCECodeVerifierMissingError');
    // The failure branch must exist and must not reuse the success string.
    const failure = src.slice(src.indexOf('if (verifierMissing)'));
    expect(failure).toMatch(/could not confirm this link/i);
  });
});

describe('/job-alerts/unsubscribe does not offer actions on a dead token', () => {
  it('treats 400 and 404 as an invalid link', () => {
    const src = readCode(UNSUBSCRIBE);
    expect(src).toContain('r.status === 404 || r.status === 400');
    expect(src).toMatch(/no longer valid/i);
  });
});

describe('/my-applications separates "signed out" from "the server broke"', () => {
  it('only a 401 renders the sign-in message', () => {
    const src = readCode(MY_APPS);
    expect(src).toContain('r.status === 401');
    expect(src).toMatch(/could not load your applications/i);
  });
});

describe('site-wide job counts go through publicJobsWhere', () => {
  it('/signup counts with the shared predicate, not bare isPublished', () => {
    const src = readCode(SIGNUP);
    expect(src).toContain('publicJobsWhere()');
    expect(src).not.toMatch(/where:\s*\{\s*isPublished:\s*true\s*\}/);
  });
});

describe('role toggles expose their selected state', () => {
  it.each([LOGIN_CONTENT, SIGNUP_FORM])('%s sets aria-pressed on both halves', (file) => {
    const src = read(file);
    expect(src).toContain("aria-pressed={role === 'seeker'}");
    expect(src).toContain("aria-pressed={role === 'employer'}");
  });
});

describe('signup does not lose what the user asked for', () => {
  it('rejects whitespace-only names before creating the account', () => {
    const src = readCode(SIGNUP_FORM);
    expect(src).toContain('!firstName.trim() || !lastName.trim()');
  });

  it('checks the profile POST and says so when the opt-ins did not save', () => {
    const src = readCode(SIGNUP_FORM);
    expect(src).toContain('if (!profileRes.ok)');
    expect(src).toContain('setPrefsWarning');
  });

  it('clears the resend countdown on unmount', () => {
    const src = readCode(SIGNUP_FORM);
    expect(src).toContain('resendTimerRef');
    expect(src).toContain('clearInterval(resendTimerRef.current)');
  });
});

describe('the newsletter toggle never invents a state it does not know', () => {
  it('distinguishes a failed status read from "not subscribed"', () => {
    const src = readCode(NEWSLETTER);
    expect(src).toContain('setStatusError(true)');
    expect(src).toContain('statusError');
  });

  it('checks the save response before leaving the switch flipped', () => {
    const src = readCode(NEWSLETTER);
    expect(src).toContain('if (!res.ok) throw new Error');
    expect(src).toContain('setSaveError(true)');
  });
});

describe('/saved is honest about where the list lives', () => {
  it('clears a stale error before each refetch', () => {
    const src = readCode(SAVED);
    const fn = src.slice(src.indexOf('const fetchSavedJobs'), src.indexOf('const fetchAppliedJobs'));
    expect(fn).toContain('setError(null)');
  });

  it('offers a sign-in route to an anonymous visitor', () => {
    const src = readCode(SAVED);
    expect(src).toContain('signedIn === false');
    expect(src).toContain('/login?redirectTo=/saved');
  });
});

describe('icon-only and dynamically-labelled controls have accessible names', () => {
  it('the /messages send button is named', () => {
    expect(read(MESSAGES)).toContain('aria-label="Send message"');
  });

  it('screening answers wire the question text to its control', () => {
    const src = read(SCREENING);
    expect(src).toContain('htmlFor={q.answerType');
    expect(src).toContain('aria-labelledby={`screening-${q.questionKey}-label`}');
    expect(src).toContain('aria-pressed={a.answerBool === v}');
  });

  it('open-ended responses wire the question text to its textarea', () => {
    const src = read(OPEN_ENDED);
    expect(src).toContain('htmlFor={`open-ended-${q.questionKey}`}');
    expect(src).toContain('id={`open-ended-${q.questionKey}`}');
  });

  it.each([
    'components/settings/EducationSection.tsx',
    'components/settings/WorkExperienceSection.tsx',
    'components/settings/LicensesSection.tsx',
    'components/settings/CertificationsSection.tsx',
    'components/settings/ReferencesSection.tsx',
  ])('%s names its close control', (file) => {
    expect(read(file)).toMatch(/aria-label="Close [a-z ]+ form"/);
  });
});

describe('the account surface uses only contrast-passing text colours', () => {
  // components/auth/authTokens.ts documents the measurements: #6B7F8A is
  // ~3.92:1 on white, #8A9BA6 ~2.86:1, #94A3B0 ~2.35:1 and #B0C4BC ~1.83:1,
  // all under the 4.5:1 WCAG AA floor. #4B5E68 (~5.9:1) is the replacement.
  const FAILING = ['#6B7F8A', '#8A9BA6', '#B0C4BC'] as const;

  it.each(ACCOUNT_SURFACES)('%s ships none of the failing grays', (file) => {
    const src = readCode(file);
    for (const hex of FAILING) {
      expect(src, `${file} still uses ${hex}`).not.toContain(`'${hex}'`);
    }
  });

  it('the header CTA pill clears 4.5:1 for its white label', () => {
    const src = readCode(HEADER_AUTH);
    expect(src).toContain("backgroundColor: '#0F766E'");
    expect(src).not.toContain("backgroundColor: '#0D9488'");
  });

  it('the header hover handler identifies the primary pill by data attribute', () => {
    // It used to compare the live inline backgroundColor against a hardcoded
    // rgb() string, which stopped matching the moment that colour changed.
    const src = readCode(HEADER_AUTH);
    expect(src).not.toContain('rgb(13, 148, 136)');
    expect(src).toContain("dataset.variant === 'primary'");
  });

  it.each([LOGIN_CONTENT, SIGNUP_FORM])('%s uses the compliant teal for link text', (file) => {
    const src = readCode(file);
    expect(src).toContain("const accent = role === 'employer' ? '#B45309' : '#0F766E';");
  });
});
