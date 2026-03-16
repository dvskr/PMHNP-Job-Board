/**
 * Login Detector — Detects login pages, SSO redirects, and authentication walls.
 *
 * When the extension detects a login page instead of an application form,
 * it surfaces a message guiding the user to sign in first before autofill
 * can proceed.
 *
 * ## Detection Strategies
 *
 * 1. **URL patterns** — Common login/auth URLs (`/login`, `/signin`, `/sso`)
 * 2. **DOM heuristics** — Password fields + submit buttons, "Forgot password?" links
 * 3. **SSO provider detection** — Okta, Auth0, Azure AD, OneLogin, etc.
 * 4. **Redirect awareness** — Detects `returnUrl`, `redirect_uri`, `RelayState` params
 */

import { log, warn } from '@/shared/logger';

// ─── URL Patterns ───

/** URL paths that typically indicate a login page */
const LOGIN_URL_PATTERNS = [
    /\/(log[-_]?in|sign[-_]?in|auth(?:enticate)?|sso|cas|saml)\b/i,
    /\/oauth2?\/(authorize|login|consent)/i,
    /\/identity\/(login|authenticate)/i,
    /\/account\/(login|signin|access)/i,
    /\/session\/(new|create)/i,
];

/** URL paths that indicate an SSO provider */
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

/** Query parameters that indicate a redirect back to the application */
const REDIRECT_PARAMS = [
    'returnUrl', 'return_url', 'returnTo', 'return_to',
    'redirect_uri', 'redirect_url', 'redirect',
    'RelayState', 'state', 'next', 'continue',
    'callbackUrl', 'callback_url', 'target',
    'goto', 'destination', 'ref', 'from',
];

// ─── DOM Heuristics ───

/** Selectors that strongly indicate a login form */
const LOGIN_FORM_SELECTORS = [
    'input[type="password"]',
    'input[name="password"]',
    'input[name="passwd"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
];

/** Text patterns on buttons/links that suggest login/signup */
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

// ─── Main Detection ───

export interface LoginDetectionResult {
    /** Whether this looks like a login/auth page */
    isLoginPage: boolean;

    /** Overall confidence: 0.0 – 1.0 */
    confidence: number;

    /** Specific detection type */
    type: 'login' | 'sso' | 'signup' | 'oauth' | 'none';

    /** SSO provider name if detected */
    ssoProvider?: string;

    /** Redirect URL after login (from query params) */
    redirectUrl?: string;

    /** User-facing message to display */
    message: string;
}

/**
 * Analyze the current page to determine if it's a login/authentication page.
 */
export function detectLoginPage(): LoginDetectionResult {
    let score = 0;
    let type: LoginDetectionResult['type'] = 'none';
    let ssoProvider: string | undefined;
    let redirectUrl: string | undefined;

    const url = window.location.href;
    const path = window.location.pathname;
    const hostname = window.location.hostname;

    // ─── 1) URL pattern check (+0.4 each) ───

    for (const pattern of LOGIN_URL_PATTERNS) {
        if (pattern.test(path) || pattern.test(url)) {
            score += 0.4;
            type = type === 'none' ? 'login' : type;
            log(`[PMHNP-Login] URL matches login pattern: ${pattern}`);
            break;
        }
    }

    // ─── 2) SSO provider check (+0.5) ───

    for (const pattern of SSO_PROVIDER_PATTERNS) {
        if (pattern.test(hostname) || pattern.test(url)) {
            score += 0.5;
            type = 'sso';
            ssoProvider = detectSSOProviderName(hostname);
            log(`[PMHNP-Login] SSO provider detected: ${ssoProvider}`);
            break;
        }
    }

    // ─── 3) Redirect parameter check (+0.2) ───

    const params = new URLSearchParams(window.location.search);
    for (const param of REDIRECT_PARAMS) {
        const value = params.get(param);
        if (value && value.startsWith('http')) {
            score += 0.2;
            redirectUrl = value;
            log(`[PMHNP-Login] Redirect param found: ${param}=${value.substring(0, 50)}...`);
            break;
        }
    }

    // ─── 4) DOM heuristics ───

    // Password fields (+0.3)
    const passwordFields = document.querySelectorAll(LOGIN_FORM_SELECTORS.join(', '));
    if (passwordFields.length > 0 && passwordFields.length <= 2) {
        score += 0.3;
        log(`[PMHNP-Login] Found ${passwordFields.length} password field(s)`);
    }

    // Login/signin button text (+0.2)
    const buttons = document.querySelectorAll('button, input[type="submit"], a[role="button"]');
    for (const btn of buttons) {
        const text = btn.textContent?.trim() || (btn as HTMLInputElement).value || '';
        if (LOGIN_BUTTON_TEXT.some(p => p.test(text))) {
            score += 0.2;
            log(`[PMHNP-Login] Login button found: "${text}"`);
            break;
        }
    }

    // "Forgot password" link (+0.2)
    const links = document.querySelectorAll('a, button');
    let hasForgotPassword = false;
    let hasCreateAccount = false;
    for (const link of links) {
        const text = link.textContent?.trim() || '';
        if (!hasForgotPassword && FORGOT_PASSWORD_TEXT.some(p => p.test(text))) {
            hasForgotPassword = true;
            score += 0.2;
            log(`[PMHNP-Login] "Forgot password" link found`);
        }
        if (!hasCreateAccount && CREATE_ACCOUNT_TEXT.some(p => p.test(text))) {
            hasCreateAccount = true;
            score += 0.1;
            if (type === 'none') type = 'signup';
            log(`[PMHNP-Login] "Create account" link found`);
        }
    }

    // ─── 5) Negative signals (application form indicators) ───

    // If there are many text inputs (>3), it's likely an application, not login
    const textInputs = document.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"], textarea, select'
    );
    if (textInputs.length > 4) {
        score -= 0.3;
        log(`[PMHNP-Login] Many form fields (${textInputs.length}) — likely application, not login`);
    }

    // If OAuth consent page
    if (/consent|authorize|permission/i.test(path)) {
        type = 'oauth';
    }

    // ─── Build result ───

    const confidence = Math.max(0, Math.min(1, score));
    const isLoginPage = confidence >= 0.5;

    const message = buildMessage(isLoginPage, type, ssoProvider, redirectUrl);

    if (isLoginPage) {
        warn(`[PMHNP-Login] Login page detected (confidence: ${confidence.toFixed(2)}, type: ${type})`);
    }

    return { isLoginPage, confidence, type, ssoProvider, redirectUrl, message };
}

// ─── Helpers ───

function detectSSOProviderName(hostname: string): string {
    if (/okta/i.test(hostname)) return 'Okta';
    if (/auth0/i.test(hostname)) return 'Auth0';
    if (/microsoftonline/i.test(hostname)) return 'Microsoft (Azure AD)';
    if (/accounts\.google/i.test(hostname)) return 'Google';
    if (/onelogin/i.test(hostname)) return 'OneLogin';
    if (/ping/i.test(hostname)) return 'PingIdentity';
    return 'SSO Provider';
}

function buildMessage(
    isLogin: boolean,
    type: LoginDetectionResult['type'],
    ssoProvider?: string,
    redirectUrl?: string,
): string {
    if (!isLogin) return '';

    if (type === 'sso' && ssoProvider) {
        return `🔐 Sign in with ${ssoProvider} to access the application form. Autofill will activate once you reach the application page.`;
    }

    if (type === 'oauth') {
        return '🔐 Complete the authorization to continue to the application form.';
    }

    if (type === 'signup') {
        return '📝 Create an account first, then navigate to the job application to use autofill.';
    }

    if (redirectUrl) {
        return '🔐 Sign in to continue. You\'ll be redirected to the application form after logging in.';
    }

    return '🔐 This looks like a login page. Sign in first, then autofill will activate on the application form.';
}
