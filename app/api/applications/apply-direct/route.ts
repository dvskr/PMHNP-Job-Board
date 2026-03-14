import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_COVER_LETTER_LENGTH = 5000;

/** Strip all HTML tags to prevent XSS when employer views the cover letter */
function sanitizeText(text: string): string {
    return text
        .replace(/<[^>]*>/g, '')          // strip HTML tags
        .replace(/&lt;/g, '<')            // decode common entities
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/javascript:/gi, '')     // strip javascript: protocol
        .replace(/on\w+\s*=/gi, '')       // strip inline event handlers
        .trim();
}

/** Only allow resume URLs from our own Supabase storage */
function isValidResumeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        const allowedHosts = [
            process.env.NEXT_PUBLIC_SUPABASE_URL
                ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
                : '',
            'supabase.co',
        ].filter(Boolean);

        return allowedHosts.some(host => parsed.hostname.endsWith(host as string));
    } catch {
        return false;
    }
}

// ── Handler ──────────────────────────────────────────────────────────────────

/**
 * POST /api/applications/apply-direct
 * Submit an in-platform job application (for jobs with applyOnPlatform=true).
 * Body: { jobId: string, coverLetter?: string, resumeUrl?: string, consent: boolean }
 */
export async function POST(request: NextRequest) {
    try {
        // 0. Rate limit (per-IP, 10 req/min)
        const rateLimitResult = await rateLimit(request, 'applyDirect', RATE_LIMITS.applyDirect);
        if (rateLimitResult) return rateLimitResult;

        // 1. Require authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Parse & validate body
        const body = await request.json();
        const { jobId, coverLetter, coverLetterUrl, resumeUrl, consent } = body;

        if (!jobId || typeof jobId !== 'string') {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        // GDPR consent is mandatory
        if (!consent) {
            return NextResponse.json(
                { error: 'You must consent to sharing your data with the employer' },
                { status: 400 }
            );
        }

        // Sanitize cover letter (XSS prevention + length cap)
        let sanitizedCoverLetter: string | null = null;
        if (coverLetter && typeof coverLetter === 'string') {
            sanitizedCoverLetter = sanitizeText(coverLetter).slice(0, MAX_COVER_LETTER_LENGTH) || null;
        }

        // Validate resume URL (must be from our Supabase storage)
        let validResumeUrl: string | null = null;
        if (resumeUrl && typeof resumeUrl === 'string') {
            if (!isValidResumeUrl(resumeUrl)) {
                return NextResponse.json(
                    { error: 'Invalid resume URL. Please upload your resume through the platform.' },
                    { status: 400 }
                );
            }
            validResumeUrl = resumeUrl;
        }

        // Validate cover letter URL (if uploaded as PDF)
        let validCoverLetterUrl: string | null = null;
        if (coverLetterUrl && typeof coverLetterUrl === 'string') {
            if (!isValidResumeUrl(coverLetterUrl)) {
                return NextResponse.json(
                    { error: 'Invalid cover letter URL. Please upload your cover letter through the platform.' },
                    { status: 400 }
                );
            }
            validCoverLetterUrl = coverLetterUrl;
        }

        // 3. Verify the job exists and accepts platform applications
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
                id: true,
                title: true,
                employer: true,
                applyOnPlatform: true,
                isPublished: true,
                expiresAt: true,
                employerJobs: {
                    select: {
                        contactEmail: true,
                        employerName: true,
                        notifyOnApplication: true,
                    },
                },
            },
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        if (!job.applyOnPlatform) {
            return NextResponse.json(
                { error: 'This job does not accept platform applications' },
                { status: 400 }
            );
        }

        if (!job.isPublished) {
            return NextResponse.json(
                { error: 'This job is no longer active' },
                { status: 400 }
            );
        }

        if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
            return NextResponse.json(
                { error: 'This job has expired' },
                { status: 400 }
            );
        }

        // 4. Get applicant profile
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                resumeUrl: true,
                headline: true,
                yearsExperience: true,
            },
        });

        if (!profile) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
        }

        // Use provided (validated) resume URL, or fall back to profile resume
        const applicationResumeUrl = validResumeUrl || profile.resumeUrl || null;

        // 5. Upsert the application (don't duplicate if user already applied)
        const application = await prisma.jobApplication.upsert({
            where: {
                userId_jobId: { userId: user.id, jobId },
            },
            update: {
                coverLetter: sanitizedCoverLetter,
                coverLetterUrl: validCoverLetterUrl,
                resumeUrl: applicationResumeUrl,
                consentGiven: true,
                consentGivenAt: new Date(),
                withdrawnAt: null, // un-withdraw if re-applying
            },
            create: {
                userId: user.id,
                jobId,
                coverLetter: sanitizedCoverLetter,
                coverLetterUrl: validCoverLetterUrl,
                resumeUrl: applicationResumeUrl,
                sourceUrl: 'platform',
                consentGiven: true,
                consentGivenAt: new Date(),
            },
        });

        // 6. Send notification email to the employer (fire-and-forget)
        const employerEmail = job.employerJobs?.contactEmail;
        const shouldNotify = job.employerJobs?.notifyOnApplication !== false; // default true
        if (employerEmail && shouldNotify) {
            try {
                const { sendNewApplicationEmail } = await import('@/lib/email-service');
                await sendNewApplicationEmail({
                    employerEmail,
                    employerName: job.employerJobs?.employerName || job.employer,
                    jobTitle: job.title,
                    candidateName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'A candidate',
                    candidateHeadline: profile.headline || undefined,
                    candidateExperience: profile.yearsExperience || undefined,
                    hasResume: !!applicationResumeUrl,
                    hasCoverLetter: !!sanitizedCoverLetter,
                });
            } catch (emailError) {
                logger.error('Failed to send new application notification email', emailError);
                // Don't fail the request if email fails
            }
        }

        logger.info('Direct application submitted', {
            applicationId: application.id,
            jobId,
            userId: user.id,
        });

        // 7. Send confirmation email to the CANDIDATE (fire-and-forget)
        if (profile.email) {
            try {
                const { sendApplicationConfirmationEmail } = await import('@/lib/email-service');
                await sendApplicationConfirmationEmail({
                    candidateEmail: profile.email,
                    candidateName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'there',
                    jobTitle: job.title,
                    employerName: job.employerJobs?.employerName || job.employer,
                    hasResume: !!applicationResumeUrl,
                    hasCoverLetter: !!sanitizedCoverLetter,
                });
            } catch (confirmError) {
                logger.error('Failed to send application confirmation to candidate', confirmError);
            }
        }

        return NextResponse.json({
            success: true,
            applicationId: application.id,
        });
    } catch (error) {
        logger.error('Error in apply-direct:', error);
        return NextResponse.json(
            { error: 'Failed to submit application' },
            { status: 500 }
        );
    }
}
