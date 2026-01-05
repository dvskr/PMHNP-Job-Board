import crypto from 'crypto';

/**
 * Anonymize email address for logging
 * Uses SHA-256 hash to create a deterministic but private identifier
 */
export function anonymizeEmail(email: string): string {
    if (!email) return 'unknown';
    // Use a salted hash for correlation without exposing PII
    const salt = process.env.EMAIL_HASH_SALT || 'default-salt-do-not-use-in-prod';
    return crypto.createHash('sha256').update(`${salt}:${email.toLowerCase().trim()}`).digest('hex').substring(0, 16);
}
