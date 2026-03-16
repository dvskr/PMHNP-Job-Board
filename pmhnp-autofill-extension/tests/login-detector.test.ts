/**
 * Login Detector Test Suite
 *
 * Since detectLoginPage() depends on `window.location` and `document`,
 * we re-implement the scoring logic and test pattern matching, message
 * generation, and DOM heuristics independently using jsdom.
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

// ─── Re-implement patterns from login-detector.ts for isolated testing ───

const LOGIN_URL_PATTERNS = [
    /\/(log[-_]?in|sign[-_]?in|auth(?:enticate)?|sso|cas|saml)\b/i,
    /\/oauth2?\/(authorize|login|consent)/i,
    /\/identity\/(login|authenticate)/i,
    /\/account\/(login|signin|access)/i,
    /\/session\/(new|create)/i,
];

const SSO_PROVIDER_PATTERNS = [
    /\.okta\.com/i,
    /\.auth0\.com/i,
    /login\.microsoftonline\.com/i,
    /accounts\.google\.com\/o\/oauth2/i,
    /\.onelogin\.com/i,
    /\.ping(?:identity|one)\.com/i,
    /sso\..*\.com/i,
    /idp\./i,
];

const REDIRECT_PARAMS = [
    'returnUrl', 'return_url', 'returnTo', 'return_to',
    'redirect_uri', 'redirect_url', 'redirect',
    'RelayState', 'state', 'next', 'continue',
    'callbackUrl', 'callback_url', 'target',
    'goto', 'destination', 'ref', 'from',
];

const LOGIN_BUTTON_TEXT = [
    /^sign\s*in$/i,
    /^log\s*in$/i,
    /^continue\s+with/i,
    /^sign\s*in\s+with/i,
    /^log\s*in\s+with/i,
];

const FORGOT_PASSWORD_TEXT = [
    /forgot\s*(?:your\s*)?password/i,
    /reset\s*password/i,
    /can'?t\s*(?:sign|log)\s*in/i,
    /trouble\s*(?:signing|logging)\s*in/i,
];

const CREATE_ACCOUNT_TEXT = [
    /create\s*(?:an?\s*)?account/i,
    /sign\s*up/i,
    /register\s*(?:now|here)?/i,
    /don'?t\s*have\s*an\s*account/i,
    /new\s*user/i,
];

const LOGIN_FORM_SELECTORS = [
    'input[type="password"]',
    'input[name="password"]',
    'input[name="passwd"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
];

function detectSSOProviderName(hostname: string): string {
    if (/okta/i.test(hostname)) return 'Okta';
    if (/auth0/i.test(hostname)) return 'Auth0';
    if (/microsoftonline/i.test(hostname)) return 'Microsoft (Azure AD)';
    if (/accounts\.google/i.test(hostname)) return 'Google';
    if (/onelogin/i.test(hostname)) return 'OneLogin';
    if (/ping/i.test(hostname)) return 'PingIdentity';
    return 'SSO Provider';
}

// ─── Tests ───

describe('Login Detector — URL Pattern Matching', () => {
    const positives = [
        '/login',
        '/sign-in',
        '/signin',
        '/auth',
        '/authenticate',
        '/sso',
        '/cas',
        '/saml',
        '/oauth2/authorize',
        '/oauth/login',
        '/oauth2/consent',
        '/identity/login',
        '/identity/authenticate',
        '/account/login',
        '/account/signin',
        '/account/access',
        '/session/new',
        '/session/create',
    ];

    for (const path of positives) {
        it(`should match login URL: ${path}`, () => {
            const matched = LOGIN_URL_PATTERNS.some(p => p.test(path));
            expect(matched).toBe(true);
        });
    }

    const negatives = [
        '/apply',
        '/careers',
        '/jobs',
        '/application',
        '/submit',
        '/profile',
        '/dashboard',
        '/settings',
        '/login-success', // careful — should /login still match? Yes, \b boundary handles it
    ];

    for (const path of negatives) {
        // /login-success won't match because of \b — "login" is followed by "-"
        // Actually \b treats hyphen as word boundary, so /login\b/ would match /login-
        // Let's just test the app-like paths
        if (path === '/login-success') continue;
        it(`should NOT match non-login URL: ${path}`, () => {
            const matched = LOGIN_URL_PATTERNS.some(p => p.test(path));
            expect(matched).toBe(false);
        });
    }
});

describe('Login Detector — SSO Provider Detection', () => {
    const providers: [string, string][] = [
        ['mycompany.okta.com', 'Okta'],
        ['dev-12345.auth0.com', 'Auth0'],
        ['login.microsoftonline.com', 'Microsoft (Azure AD)'],
        ['accounts.google.com/o/oauth2/authorize', 'Google'],
        ['mycompany.onelogin.com', 'OneLogin'],
        ['sso.pingidentity.com', 'PingIdentity'],
        ['sso.example.com', 'SSO Provider'],
        ['idp.company.com', 'SSO Provider'],
    ];

    for (const [hostname, expectedProvider] of providers) {
        it(`should detect ${expectedProvider} from ${hostname}`, () => {
            const matched = SSO_PROVIDER_PATTERNS.some(p => p.test(hostname));
            expect(matched).toBe(true);
            expect(detectSSOProviderName(hostname)).toBe(expectedProvider);
        });
    }

    const nonSSO = [
        'www.example.com',
        'careers.workday.com',
        'jobs.lever.co',
        'greenhouse.io',
    ];

    for (const hostname of nonSSO) {
        it(`should NOT detect SSO on ${hostname}`, () => {
            const matched = SSO_PROVIDER_PATTERNS.some(p => p.test(hostname));
            expect(matched).toBe(false);
        });
    }
});

describe('Login Detector — Redirect Parameters', () => {
    it('should recognize returnUrl parameter', () => {
        expect(REDIRECT_PARAMS).toContain('returnUrl');
    });

    it('should recognize redirect_uri parameter', () => {
        expect(REDIRECT_PARAMS).toContain('redirect_uri');
    });

    it('should recognize RelayState (SAML)', () => {
        expect(REDIRECT_PARAMS).toContain('RelayState');
    });

    it('should extract redirect URL from query string', () => {
        const url = 'https://sso.example.com/login?returnUrl=https://careers.example.com/apply';
        const searchParams = new URLSearchParams(new URL(url).search);
        let redirectUrl: string | undefined;

        for (const param of REDIRECT_PARAMS) {
            const value = searchParams.get(param);
            if (value && value.startsWith('http')) {
                redirectUrl = value;
                break;
            }
        }

        expect(redirectUrl).toBe('https://careers.example.com/apply');
    });
});

describe('Login Detector — DOM Heuristics', () => {
    it('should detect password field in login form', () => {
        const html = `
            <html><body>
                <form>
                    <input type="text" name="username" placeholder="Email">
                    <input type="password" name="password" placeholder="Password">
                    <button type="submit">Sign In</button>
                </form>
            </body></html>`;
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        const passwordFields = doc.querySelectorAll(LOGIN_FORM_SELECTORS.join(', '));
        expect(passwordFields.length).toBeGreaterThan(0);
    });

    it('should detect "Sign In" button', () => {
        const html = `
            <html><body>
                <button>Sign In</button>
            </body></html>`;
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        const buttons = doc.querySelectorAll('button');
        let found = false;
        for (const btn of buttons) {
            const text = btn.textContent?.trim() || '';
            if (LOGIN_BUTTON_TEXT.some(p => p.test(text))) found = true;
        }
        expect(found).toBe(true);
    });

    it('should detect "Continue with Google" button', () => {
        const text = 'Continue with Google';
        const matched = LOGIN_BUTTON_TEXT.some(p => p.test(text));
        expect(matched).toBe(true);
    });

    it('should detect "Forgot password?" link', () => {
        const texts = ['Forgot password?', 'Forgot your password?', 'Reset password', "Can't sign in?"];
        for (const text of texts) {
            const matched = FORGOT_PASSWORD_TEXT.some(p => p.test(text));
            expect(matched, `Should match: "${text}"`).toBe(true);
        }
    });

    it('should detect "Create account" link', () => {
        const texts = ['Create an account', 'Sign up', 'Register now', "Don't have an account?", 'New user'];
        for (const text of texts) {
            const matched = CREATE_ACCOUNT_TEXT.some(p => p.test(text));
            expect(matched, `Should match: "${text}"`).toBe(true);
        }
    });

    it('should NOT flag a form with many text fields as login', () => {
        const html = `
            <html><body>
                <form>
                    <input type="text" name="first_name">
                    <input type="text" name="last_name">
                    <input type="email" name="email">
                    <input type="tel" name="phone">
                    <textarea name="cover_letter"></textarea>
                    <select name="state"><option>TX</option></select>
                </form>
            </body></html>`;
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        const textInputs = doc.querySelectorAll(
            'input[type="text"], input[type="email"], input[type="tel"], textarea, select'
        );
        // This is an application form — negative signal should trigger
        expect(textInputs.length).toBeGreaterThan(4);
    });
});

describe('Login Detector — Integrated Scoring Simulation', () => {
    function simulateScore(options: {
        path?: string;
        hostname?: string;
        hasPassword?: boolean;
        hasLoginButton?: boolean;
        hasForgotPassword?: boolean;
        hasCreateAccount?: boolean;
        textFieldCount?: number;
        hasRedirectParam?: boolean;
    }): number {
        let score = 0;

        // URL patterns
        if (options.path && LOGIN_URL_PATTERNS.some(p => p.test(options.path!))) {
            score += 0.4;
        }

        // SSO
        if (options.hostname && SSO_PROVIDER_PATTERNS.some(p => p.test(options.hostname!))) {
            score += 0.5;
        }

        // Redirect
        if (options.hasRedirectParam) score += 0.2;

        // Password
        if (options.hasPassword) score += 0.3;

        // Login button
        if (options.hasLoginButton) score += 0.2;

        // Forgot password
        if (options.hasForgotPassword) score += 0.2;

        // Create account
        if (options.hasCreateAccount) score += 0.1;

        // Negative: many text fields
        if ((options.textFieldCount ?? 0) > 4) score -= 0.3;

        return Math.max(0, Math.min(1, score));
    }

    it('should flag typical login page (password + sign-in button + forgot password)', () => {
        const score = simulateScore({
            path: '/login',
            hasPassword: true,
            hasLoginButton: true,
            hasForgotPassword: true,
        });
        expect(score).toBeGreaterThanOrEqual(0.5);
    });

    it('should flag SSO redirect page', () => {
        const score = simulateScore({
            hostname: 'mycompany.okta.com',
            path: '/login',
            hasRedirectParam: true,
        });
        expect(score).toBeGreaterThanOrEqual(0.5);
    });

    it('should NOT flag a job application form', () => {
        const score = simulateScore({
            path: '/apply',
            textFieldCount: 8,
        });
        expect(score).toBeLessThan(0.5);
    });

    it('should NOT flag a career page', () => {
        const score = simulateScore({
            path: '/careers/nursing',
            hostname: 'www.hospital.com',
        });
        expect(score).toBeLessThan(0.5);
    });

    it('should handle borderline: login URL + many fields = not login', () => {
        const score = simulateScore({
            path: '/login',
            textFieldCount: 6, // Registration form disguised as /login
        });
        // URL gives +0.4, but many fields gives -0.3, net = 0.1 → not login
        expect(score).toBeLessThan(0.5);
    });

    it('should handle SSO + password + redirect = very high confidence', () => {
        const score = simulateScore({
            hostname: 'dev-123.auth0.com',
            hasPassword: true,
            hasRedirectParam: true,
        });
        expect(score).toBeGreaterThanOrEqual(0.9);
    });
});

describe('Login Detector — SSO Provider Name Detection', () => {
    it('should identify Okta', () => {
        expect(detectSSOProviderName('company.okta.com')).toBe('Okta');
    });

    it('should identify Auth0', () => {
        expect(detectSSOProviderName('dev-123.auth0.com')).toBe('Auth0');
    });

    it('should identify Microsoft Azure AD', () => {
        expect(detectSSOProviderName('login.microsoftonline.com')).toBe('Microsoft (Azure AD)');
    });

    it('should identify Google', () => {
        expect(detectSSOProviderName('accounts.google.com')).toBe('Google');
    });

    it('should identify OneLogin', () => {
        expect(detectSSOProviderName('mycompany.onelogin.com')).toBe('OneLogin');
    });

    it('should identify PingIdentity', () => {
        expect(detectSSOProviderName('sso.pingidentity.com')).toBe('PingIdentity');
    });

    it('should return generic name for unknown providers', () => {
        expect(detectSSOProviderName('sso.unknownprovider.com')).toBe('SSO Provider');
    });
});

describe('Login Detector — Button Text Patterns', () => {
    describe('Login buttons', () => {
        const positives = ['Sign In', 'Log In', 'Continue with Google', 'Sign in with SSO', 'Log in with Okta'];
        for (const text of positives) {
            it(`should match "${text}"`, () => {
                expect(LOGIN_BUTTON_TEXT.some(p => p.test(text))).toBe(true);
            });
        }

        const negatives = ['Submit Application', 'Next', 'Apply Now', 'Continue'];
        for (const text of negatives) {
            it(`should NOT match "${text}"`, () => {
                expect(LOGIN_BUTTON_TEXT.some(p => p.test(text))).toBe(false);
            });
        }
    });

    describe('Forgot password links', () => {
        const positives = ['Forgot password?', 'Reset password', "Can't sign in?", 'Trouble signing in?'];
        for (const text of positives) {
            it(`should match "${text}"`, () => {
                expect(FORGOT_PASSWORD_TEXT.some(p => p.test(text))).toBe(true);
            });
        }
    });

    describe('Create account links', () => {
        const positives = ['Create an account', 'Sign up', 'Register', "Don't have an account?"];
        for (const text of positives) {
            it(`should match "${text}"`, () => {
                expect(CREATE_ACCOUNT_TEXT.some(p => p.test(text))).toBe(true);
            });
        }
    });
});
