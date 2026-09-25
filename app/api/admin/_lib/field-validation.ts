/**
 * Shared request-shape checks for the admin write APIs.
 *
 * Every admin PATCH/PUT handler used to copy an allow-list of field NAMES out
 * of the JSON body and hand the values straight to Prisma. An allow-list of
 * names is not validation: `{"isPublished":"yes"}` reached the database and
 * came back to the caller as a 500, and `{"title":"   "}` was stored happily,
 * putting a blank title on a published listing. The same gap on query params
 * let `parseInt('abc')` survive `Math.max`/`Math.min` as NaN and reach a
 * Prisma `skip`/`take` or a Date constructor.
 *
 * A malformed request is the caller's fault: it deserves a 400 naming the
 * offending field, never a 500 that looks like a server fault in monitoring.
 *
 * Nothing in here is admin-specific in principle, but it lives under
 * app/api/admin so the console's handlers share one vocabulary; the public
 * routes have their own (app/api/_lib/json-body.ts).
 */

/** Prisma's "record to update/delete does not exist" code. */
const PRISMA_RECORD_NOT_FOUND = 'P2025';

/**
 * True when Prisma refused because the row is gone. Callers turn this into a
 * 404: an unknown id is a client mistake, not a server fault.
 */
export function isRecordNotFound(error: unknown): boolean {
    return (error as { code?: unknown } | null)?.code === PRISMA_RECORD_NOT_FOUND;
}

export interface BoundedIntOptions {
    /** Param name, used in the error message so the caller can fix the request. */
    name: string;
    /** Value when the param is absent or empty. */
    fallback: number;
    min: number;
    max: number;
}

export type BoundedIntResult =
    | { ok: true; value: number }
    | { ok: false; error: string };

/**
 * Parse an integer query param, clamped to a range.
 *
 * Absent or empty means "use the default". Anything present must be a whole
 * number: `'abc'`, `'1.5'` and `'5 OR 1=1'` are rejected here rather than
 * becoming NaN three call frames later. Out-of-range values still clamp,
 * which is the long-standing behaviour and is not an error.
 */
export function parseBoundedInt(
    raw: string | null,
    { name, fallback, min, max }: BoundedIntOptions,
): BoundedIntResult {
    if (raw === null || raw.trim() === '') return { ok: true, value: fallback };

    const trimmed = raw.trim();
    if (!/^-?\d+$/.test(trimmed)) {
        return { ok: false, error: `${name} must be a whole number` };
    }

    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) {
        return { ok: false, error: `${name} must be a whole number` };
    }

    return { ok: true, value: Math.min(Math.max(parsed, min), max) };
}

/**
 * What a body field is allowed to hold.
 *
 *   requiredText  a non-blank string; stored trimmed. For NOT NULL columns
 *                 that are meaningless when empty (a job title, a post body).
 *   text          an optional string; trimmed, and blank becomes null so a
 *                 cleared form field reads as absent everywhere downstream.
 *   boolean       a real boolean, never the string 'true' or 'yes'.
 *   int           a whole number.
 *   stringArray   an array of strings (Postgres text[] columns).
 *   raw           passed through untouched, for fields with their own
 *                 dedicated validator further down the handler.
 */
export type AdminFieldKind =
    | 'requiredText'
    | 'text'
    | 'boolean'
    | 'int'
    | 'stringArray'
    | 'raw';

export interface AdminFieldSpec {
    kind: AdminFieldKind;
    /** Whether an explicit null clears the column. Ignored for 'raw'. */
    nullable?: boolean;
    /** Closed set of accepted values, for string kinds. */
    oneOf?: readonly string[];
}

export type CollectFieldsResult =
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; error: string };

/**
 * Pull the known fields out of a request body, type-checking each one.
 *
 * Only keys present in `specs` AND present in the body are collected, so this
 * keeps the allow-list behaviour callers already relied on and adds the type
 * check that was missing. The first bad field short-circuits: a partial write
 * built from a body we have already decided is malformed would be worse than
 * refusing the whole thing.
 */
export function collectAdminFields(
    body: Record<string, unknown>,
    specs: Record<string, AdminFieldSpec>,
): CollectFieldsResult {
    const data: Record<string, unknown> = {};

    for (const [field, spec] of Object.entries(specs)) {
        if (!(field in body)) continue;
        const value = body[field];

        if (spec.kind === 'raw') {
            data[field] = value;
            continue;
        }

        if (value === null) {
            if (!spec.nullable) {
                return { ok: false, error: `${field} cannot be null` };
            }
            data[field] = null;
            continue;
        }

        switch (spec.kind) {
            case 'requiredText': {
                if (typeof value !== 'string' || value.trim() === '') {
                    return { ok: false, error: `${field} must be a non-empty string` };
                }
                const trimmed = value.trim();
                if (spec.oneOf && !spec.oneOf.includes(trimmed)) {
                    return { ok: false, error: `${field} must be one of: ${spec.oneOf.join(', ')}` };
                }
                data[field] = trimmed;
                break;
            }
            case 'text': {
                if (typeof value !== 'string') {
                    return { ok: false, error: `${field} must be a string` };
                }
                const trimmed = value.trim();
                if (trimmed === '') {
                    if (!spec.nullable) {
                        return { ok: false, error: `${field} must be a non-empty string` };
                    }
                    data[field] = null;
                    break;
                }
                if (spec.oneOf && !spec.oneOf.includes(trimmed)) {
                    return { ok: false, error: `${field} must be one of: ${spec.oneOf.join(', ')}` };
                }
                data[field] = trimmed;
                break;
            }
            case 'boolean': {
                if (typeof value !== 'boolean') {
                    return { ok: false, error: `${field} must be true or false` };
                }
                data[field] = value;
                break;
            }
            case 'int': {
                if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
                    return { ok: false, error: `${field} must be a whole number` };
                }
                data[field] = value;
                break;
            }
            case 'stringArray': {
                if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
                    return { ok: false, error: `${field} must be an array of strings` };
                }
                data[field] = value;
                break;
            }
        }
    }

    return { ok: true, data };
}
