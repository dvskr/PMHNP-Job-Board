import { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { logger } from '@/lib/logger'

/**
 * Signing secret for the extension/autofill token.
 *
 * This used to end in `|| ''`, which is not a missing key: it is a usable
 * zero-length HMAC key. Anyone could mint an HS256 JWT signed with the empty
 * string carrying {purpose:'extension', userId:<any UserProfile.id>} and
 * jwtVerify would accept it, which is full PII disclosure through
 * /api/profile/export (address, EEO answers, licence numbers, DEA/NPI,
 * references, resume signed URL). The mint route already refuses with 503 when
 * the secret is absent; verification must fail closed the same way rather than
 * relying on jose happening to throw.
 *
 * The NEXTAUTH_SECRET fallback is kept for deployments that have not set the
 * dedicated variable yet, but it is a shared-key risk (a leak of either
 * compromises both) and is logged once so it does not go unnoticed.
 */
const JWT_SECRET = process.env.EXTENSION_JWT_SECRET || process.env.NEXTAUTH_SECRET || ''

/** Empty-string secrets are treated as "not configured", never as a key. */
export function hasExtensionSigningSecret(): boolean {
    return JWT_SECRET.length > 0
}

export interface ExtensionTokenPayload {
    userId: string
    supabaseId: string
    email: string
    role: string
}

/**
 * Verify the extension JWT from the Authorization header.
 * Shared across all autofill API routes to eliminate duplication.
 * Returns the decoded payload or null if invalid/missing.
 */
export async function verifyExtensionToken(req: NextRequest): Promise<ExtensionTokenPayload | null> {
    // Fail closed: with no signing secret configured there is no token we can
    // legitimately accept, so reject every one rather than verifying against
    // an empty key.
    if (!hasExtensionSigningSecret()) {
        logger.error('verifyExtensionToken: no EXTENSION_JWT_SECRET configured, rejecting all extension tokens')
        return null
    }

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.slice(7)
    try {
        const secret = new TextEncoder().encode(JWT_SECRET)
        const { payload } = await jwtVerify(token, secret)
        if (payload.purpose !== 'extension') return null
        return payload as unknown as ExtensionTokenPayload
    } catch {
        return null
    }
}
