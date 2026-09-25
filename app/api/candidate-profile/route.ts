import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';
import { sanitizeText, sanitizeUrl } from '@/lib/sanitize';
import { readJsonBody } from '@/app/api/_lib/json-body';

/**
 * Read one optional field with the same three-state contract PATCH
 * /api/auth/profile uses:
 *   key absent         -> undefined, leave the column alone
 *   key present, empty -> null, clear the column
 *   key present, value -> sanitized string
 *
 * Before this the handler built a full object and wrote it unconditionally,
 * so a caller that omitted phone, city, npiNumber or bio had those columns
 * nulled out. Every string field also went to Prisma raw, which both skipped
 * sanitization and made a non-string (an object, a number) throw inside the
 * driver and surface as a 500.
 */
function optionalText(raw: unknown, maxLength: number): string | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '') return null;
    if (typeof raw !== 'string') return undefined;
    const clean = sanitizeText(raw, maxLength);
    return clean.length > 0 ? clean : null;
}

/** Same three states, for an integer column. */
function optionalInt(raw: unknown, min: number, max: number): number | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '') return null;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(Math.max(Math.round(n), min), max);
}

/** Same three states, for a boolean column. */
function optionalBool(raw: unknown): boolean | undefined {
    return typeof raw === 'boolean' ? raw : undefined;
}

const MAX_DESIRED_SALARY = 2000000;
const MAX_YEARS_EXPERIENCE = 70;

export async function POST(req: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'general', RATE_LIMITS.general);
    if (rateLimitResult) return rateLimitResult;

    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;

    try {
        // Require authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Authentication required. Please sign in.' },
                { status: 401 }
            );
        }

        const body = parsed.body;
        const { firstName, lastName, email } = body as {
            firstName?: unknown;
            lastName?: unknown;
            email?: unknown;
        };

        if (
            typeof email !== 'string' || !email ||
            typeof firstName !== 'string' || !firstName.trim() ||
            typeof lastName !== 'string' || !lastName.trim()
        ) {
            return NextResponse.json(
                { error: 'First name, last name, and email are required.' },
                { status: 400 }
            );
        }

        // Verify the authenticated user owns this email
        if (user.email?.toLowerCase() !== email.toLowerCase()) {
            return NextResponse.json(
                { error: 'You can only update your own profile.' },
                { status: 403 }
            );
        }

        // linkedinUrl is rendered to employers as the candidate LinkedIn link
        // (components/employer/CandidateProfileClient.tsx), so it goes through
        // the same sanitizeUrl gate the rest of the profile surface uses
        // instead of being stored verbatim.
        const rawLinkedin = body.linkedinUrl;
        let linkedinUrl: string | null | undefined;
        if (rawLinkedin === undefined) {
            linkedinUrl = undefined;
        } else if (typeof rawLinkedin !== 'string' || rawLinkedin === '') {
            linkedinUrl = null;
        } else {
            const safe = sanitizeUrl(rawLinkedin);
            linkedinUrl = safe.length > 0 ? safe : null;
        }

        const rawAvailableDate = body.availableDate;
        let availableDate: Date | null | undefined;
        if (rawAvailableDate === undefined) {
            availableDate = undefined;
        } else if (rawAvailableDate === null || rawAvailableDate === '') {
            availableDate = null;
        } else {
            const parsedDate = new Date(rawAvailableDate as string);
            // An unparseable date used to reach Prisma as Invalid Date and 500.
            availableDate = Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
        }

        // Partial update: only keys actually present in the body are written.
        const profileData = {
            firstName: sanitizeText(firstName, 50),
            lastName: sanitizeText(lastName, 50),
            phone: optionalText(body.phone, 20),
            city: optionalText(body.city, 100),
            state: optionalText(body.state, 50),
            zipCode: optionalText(body.zipCode, 12),
            npiNumber: optionalText(body.npiNumber, 20),
            yearsExperience: optionalInt(body.yearsExperience, 0, MAX_YEARS_EXPERIENCE),
            specialties: optionalText(body.specialties, 500),
            certifications: optionalText(body.certifications, 500),
            bio: optionalText(body.bio, 5000),
            headline: optionalText(body.headline, 120),
            preferredWorkMode: optionalText(body.preferredWorkMode, 50),
            preferredJobType: optionalText(body.preferredJobType, 50),
            desiredSalaryMin: optionalInt(body.desiredSalaryMin, 0, MAX_DESIRED_SALARY),
            desiredSalaryMax: optionalInt(body.desiredSalaryMax, 0, MAX_DESIRED_SALARY),
            availableDate,
            openToOffers: optionalBool(body.openToOffers),
            profileVisible: optionalBool(body.profileVisible),
            linkedinUrl,
        };

        // Check if profile already exists
        const existing = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
        });

        if (existing) {
            const updated = await prisma.userProfile.update({
                where: { supabaseId: user.id },
                data: profileData,
            });
            return NextResponse.json({ success: true, id: updated.id, updated: true });
        } else {
            const profile = await prisma.userProfile.create({
                data: {
                    supabaseId: user.id,
                    email,
                    role: 'job_seeker',
                    ...profileData,
                    // Create needs concrete defaults where the body was silent;
                    // update leaves an absent key untouched.
                    openToOffers: profileData.openToOffers ?? true,
                    profileVisible: profileData.profileVisible ?? true,
                },
            });
            return NextResponse.json({ success: true, id: profile.id, created: true });
        }
    } catch (error) {
        console.error('Error creating/updating candidate profile:', error);
        return NextResponse.json(
            { error: 'Failed to save profile. Please try again.' },
            { status: 500 }
        );
    }
}
