import { describe, it, expect } from 'vitest';
import { sanitizeForDiscord } from '@/lib/sanitize-for-discord';

describe('sanitizeForDiscord', () => {
    it('returns empty string for null/undefined', () => {
        expect(sanitizeForDiscord(null)).toBe('');
        expect(sanitizeForDiscord(undefined)).toBe('');
    });

    it('passes through clean text untouched', () => {
        const msg = 'Failed to connect to source after 3 retries';
        expect(sanitizeForDiscord(msg)).toBe(msg);
    });

    it('redacts postgres connection URLs with credentials', () => {
        const msg = 'connect to postgres://admin:s3cret@db.aws.com:5432/prod failed';
        const out = sanitizeForDiscord(msg);
        expect(out).not.toContain('s3cret');
        expect(out).not.toContain('admin:');
        expect(out).toContain('[REDACTED_DB_URL]');
    });

    it('redacts mongodb+srv URLs', () => {
        const msg = 'auth: mongodb+srv://user:pwd@cluster.mongodb.net/app';
        expect(sanitizeForDiscord(msg)).toContain('[REDACTED_DB_URL]');
        expect(sanitizeForDiscord(msg)).not.toContain('pwd');
    });

    it('redacts redis:// URLs with creds', () => {
        const msg = 'redis://default:abc123@redis.upstash.io:6379';
        expect(sanitizeForDiscord(msg)).not.toContain('abc123');
    });

    it('redacts Bearer tokens', () => {
        const msg = 'request failed with Authorization: Bearer abc123def456ghi789';
        const out = sanitizeForDiscord(msg);
        expect(out).toContain('Bearer [REDACTED]');
        expect(out).not.toContain('abc123def456');
    });

    it('redacts Stripe / OpenAI key prefixes', () => {
        // Test fixtures contain underscores after the prefix so they
        // match the sanitizer's `[A-Za-z0-9_\-]{16,}` group but DO
        // NOT match GitHub's stricter base62-only secret scanner
        // pattern — otherwise the push fails on GH13 push protection.
        expect(sanitizeForDiscord('OpenAI: sk-proj-FAKE_KEY_FOR_TEST_ONLY')).toContain('[REDACTED_API_KEY]');
        expect(sanitizeForDiscord('Stripe: sk_live_FAKE_KEY_FOR_TEST_ONLY')).toContain('[REDACTED_API_KEY]');
        expect(sanitizeForDiscord('Anthropic: sk-ant-FAKE_KEY_FOR_TEST_ONLY')).toContain('[REDACTED_API_KEY]');
    });

    it('redacts JWT tokens', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        expect(sanitizeForDiscord(`token=${jwt}`)).toContain('[REDACTED_JWT]');
        expect(sanitizeForDiscord(`token=${jwt}`)).not.toContain('eyJhbGciOi');
    });

    it('redacts email addresses (PII)', () => {
        const msg = 'user not found: alice@company.com';
        const out = sanitizeForDiscord(msg);
        expect(out).toContain('[REDACTED_EMAIL]');
        expect(out).not.toContain('alice@company.com');
    });

    it('redacts long base64-ish blobs as fallback', () => {
        // 50-char random-looking blob, no other pattern matches
        const msg = 'unknown header value: AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKl';
        const out = sanitizeForDiscord(msg);
        expect(out).toContain('[REDACTED_TOKEN]');
    });

    it('does NOT redact short alphanumeric IDs', () => {
        const msg = 'job ID abc123 not found';
        expect(sanitizeForDiscord(msg)).toContain('abc123');
    });

    it('does NOT redact ordinary words or sentences', () => {
        const msg = 'The quick brown fox jumps over the lazy dog';
        expect(sanitizeForDiscord(msg)).toBe(msg);
    });

    it('handles multiple secrets in one string', () => {
        const msg = 'connect postgres://u:p@h/db then send to alice@x.com with Bearer abc123def456';
        const out = sanitizeForDiscord(msg);
        expect(out).toContain('[REDACTED_DB_URL]');
        expect(out).toContain('[REDACTED_EMAIL]');
        expect(out).toContain('Bearer [REDACTED]');
        expect(out).not.toContain('alice');
    });

    it('handles non-string input by coercing', () => {
        expect(sanitizeForDiscord(12345 as unknown as string)).toBe('12345');
    });
});
