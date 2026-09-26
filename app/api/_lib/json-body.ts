import { NextResponse } from 'next/server';

/**
 * Parse a request's JSON body, distinguishing "the client sent garbage" from
 * "our handler threw".
 *
 * Every public write route used to do `const body = await request.json()`
 * inside the same try whose catch returns 500. A bot, a broken integration or
 * a crawler posting `{bad` or a `text/plain` body therefore booked a server
 * error on an endpoint that never ran a line of business logic, which buries
 * real 5xx in alerting and tells the caller to retry something that can never
 * succeed. A body that does not parse is a 400.
 *
 * Usage:
 *   const parsed = await readJsonBody(request);
 *   if (!parsed.ok) return parsed.response;
 *   const { email } = parsed.body as { email?: unknown };
 *
 * The value is typed `unknown` on purpose: parsing says the bytes were JSON,
 * nothing more. Callers still validate shape. A JSON literal that is not an
 * object (`null`, `"x"`, `3`) is rejected here too, because every caller
 * destructures fields off it and would otherwise throw on `null`.
 */
export type JsonBodyResult =
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; response: NextResponse };

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
    let parsed: unknown;
    try {
        parsed = await request.json();
    } catch {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'Request body must be valid JSON.' },
                { status: 400 },
            ),
        };
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'Request body must be a JSON object.' },
                { status: 400 },
            ),
        };
    }

    return { ok: true, body: parsed as Record<string, unknown> };
}
