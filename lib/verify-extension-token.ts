import { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = process.env.EXTENSION_JWT_SECRET || process.env.NEXTAUTH_SECRET || ''

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
