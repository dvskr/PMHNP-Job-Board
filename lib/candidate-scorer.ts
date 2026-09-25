import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { complete, AiGatewayError } from '@/lib/ai/gateway';
import { loadPrompt } from '@/lib/ai/prompts/registry';

// ═══════════════════════════════════════════════════════════════
// AI Candidate Scorer — Matches candidates to job requirements
// Routes through lib/ai/gateway for cost tracking, caching, fallback.
// Prompt lives in lib/ai/prompts/candidate_scoring/ (Sprint 0.2 registry);
// loadPrompt picks the highest version in that directory.
// ═══════════════════════════════════════════════════════════════

// Permissive schema — model output can be off-spec, gateway-side Zod parsing
// catches it; we then clamp/sanitize before persisting.
const scoringResultSchema = z.object({
    score: z.number().optional(),
    matchReasons: z.array(z.unknown()).optional(),
    missingItems: z.array(z.unknown()).optional(),
});

interface JobApplicationForScoring {
    screeningAnswers: unknown;
    coverLetter: string | null;
}

/**
 * Score a candidate against a job posting.
 * Called asynchronously after application submission.
 */
export async function scoreCandidate(
    applicationId: string,
    jobId: string,
    userId: string,
): Promise<void> {
    try {
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
                title: true,
                description: true,
                location: true,
                mode: true,
                experienceLevel: true,
                benefits: true,
                setting: true,
                population: true,
                state: true,
            },
        });
        if (!job) {
            logger.warn('scoreCandidate: Job not found', { jobId });
            return;
        }

        const candidate = await prisma.userProfile.findUnique({
            where: { supabaseId: userId },
            select: {
                firstName: true,
                lastName: true,
                headline: true,
                yearsExperience: true,
                certifications: true,
                licenseStates: true,
                specialties: true,
                skills: true,
                bio: true,
                npiNumber: true,
                deaNumber: true,
                education: { orderBy: { graduationDate: 'desc' }, take: 5 },
                workExperience: { orderBy: { startDate: 'desc' }, take: 5 },
                certificationRecords: { take: 10 },
                licenses: { take: 10 },
            },
        });
        if (!candidate) {
            logger.warn('scoreCandidate: Candidate not found', { userId });
            return;
        }

        const application = await prisma.jobApplication.findUnique({
            where: { id: applicationId },
            select: { screeningAnswers: true, coverLetter: true },
        });

        const candidateSummary = buildCandidateSummary(candidate, application);
        const jobSummary = buildJobSummary(job);
        const prompt = await loadPrompt('candidate_scoring');

        const result = await complete({
            task: 'candidate_scoring',
            tenant: { type: 'candidate', id: userId },
            messages: prompt.render({ jobSummary, candidateSummary }),
            promptId: prompt.id,
            promptVersion: prompt.version,
            // Cache key includes prompt version so a prompt rollout invalidates
            // every cached score for that pair automatically.
            cacheKey: ['scoring', prompt.version, jobId, userId],
            outputSchema: scoringResultSchema,
        });

        const parsed = result.parsed ?? {};
        const score = Math.max(0, Math.min(100, Math.round(typeof parsed.score === 'number' ? parsed.score : 0)));
        const matchReasons = Array.isArray(parsed.matchReasons)
            ? parsed.matchReasons.filter((r): r is string => typeof r === 'string').slice(0, 6)
            : [];
        const missingItems = Array.isArray(parsed.missingItems)
            ? parsed.missingItems.filter((r): r is string => typeof r === 'string').slice(0, 4)
            : [];

        await prisma.jobApplication.update({
            where: { id: applicationId },
            data: {
                aiMatchScore: score,
                aiMatchReasons: matchReasons,
                aiMissingItems: missingItems,
            },
        });

        logger.info('AI scoring complete', {
            applicationId,
            score,
            cacheHit: result.cacheHit,
            fallbackUsed: result.fallbackUsed,
            costUsd: result.usage.costUsd,
        });
    } catch (err) {
        if (err instanceof AiGatewayError) {
            logger.error('scoreCandidate: gateway error', err, { applicationId, jobId, code: err.code });
        } else {
            logger.error('scoreCandidate failed', err);
        }
    }
}

/**
 * The fence markers the v2 prompt wraps the untrusted sections in.
 *
 * A trust boundary written only in the system prompt is half a control: the
 * candidate also controls the text INSIDE the fence, so without this they
 * could close the fence early ("CANDIDATE_PROFILE") and write what looks like
 * a fresh instruction block. Neutralising the markers in the data keeps the
 * boundary where the prompt says it is.
 */
const PROMPT_FENCE_MARKERS = /<<<(?:JOB_POSTING|CANDIDATE_PROFILE)|JOB_POSTING|CANDIDATE_PROFILE/g;

/** Free text a candidate or employer typed. Never an instruction to the model. */
function asUntrustedText(value: unknown): string {
    return String(value ?? '').replace(PROMPT_FENCE_MARKERS, '[redacted]');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCandidateSummary(candidate: any, application: JobApplicationForScoring | null): string {
    const parts: string[] = [];

    if (candidate.headline) parts.push(`Headline: ${asUntrustedText(candidate.headline)}`);
    if (candidate.yearsExperience) parts.push(`Years of Experience: ${candidate.yearsExperience}`);
    if (candidate.certifications) parts.push(`Certifications: ${asUntrustedText(candidate.certifications)}`);
    if (candidate.licenseStates) parts.push(`Licensed States: ${asUntrustedText(candidate.licenseStates)}`);
    if (candidate.specialties) parts.push(`Specialties: ${asUntrustedText(candidate.specialties)}`);
    if (candidate.skills?.length) parts.push(`Skills: ${asUntrustedText(candidate.skills.join(', '))}`);
    if (candidate.npiNumber) parts.push('Has NPI Number: Yes');
    if (candidate.deaNumber) parts.push('Has DEA Number: Yes');
    if (candidate.bio) parts.push(`Bio: ${asUntrustedText(candidate.bio).slice(0, 300)}`);

    if (candidate.education?.length > 0) {
        parts.push('Education:');
        for (const edu of candidate.education) {
            parts.push(`  - ${asUntrustedText(edu.degreeType)} in ${asUntrustedText(edu.fieldOfStudy || 'N/A')} from ${asUntrustedText(edu.schoolName)}`);
        }
    }

    if (candidate.workExperience?.length > 0) {
        parts.push('Work Experience:');
        for (const exp of candidate.workExperience) {
            const dates = `${exp.startDate ? new Date(exp.startDate).getFullYear() : '?'} - ${exp.isCurrent ? 'Present' : exp.endDate ? new Date(exp.endDate).getFullYear() : '?'}`;
            parts.push(`  - ${asUntrustedText(exp.jobTitle)} at ${asUntrustedText(exp.employerName)} (${dates})`);
        }
    }

    if (candidate.certificationRecords?.length > 0) {
        parts.push('Detailed Certifications:');
        for (const cert of candidate.certificationRecords) {
            parts.push(`  - ${asUntrustedText(cert.certificationName)}${cert.certifyingBody ? ` (${asUntrustedText(cert.certifyingBody)})` : ''}`);
        }
    }

    if (candidate.licenses?.length > 0) {
        parts.push('Licenses:');
        for (const lic of candidate.licenses) {
            parts.push(`  - ${asUntrustedText(lic.licenseType)} in ${asUntrustedText(lic.licenseState)} (${asUntrustedText(lic.status)})`);
        }
    }

    if (application?.screeningAnswers) {
        try {
            const answers = typeof application.screeningAnswers === 'string'
                ? JSON.parse(application.screeningAnswers)
                : application.screeningAnswers;
            if (Array.isArray(answers) && answers.length > 0) {
                parts.push('Screening Answers:');
                for (const a of answers) {
                    parts.push(`  Q: ${asUntrustedText(a.questionText)} → A: ${asUntrustedText(a.answer)}`);
                }
            }
        } catch (error) {
            // Malformed JSON in a stored answer blob must not abort scoring, but it
            // is a data-integrity signal rather than an expected shape.
            logger.warn('buildCandidateSummary: unparseable screeningAnswers, scoring without them', { error: String(error) });
        }
    }

    if (application?.coverLetter) {
        parts.push(`Cover Letter (excerpt): ${asUntrustedText(application.coverLetter).slice(0, 300)}`);
    }

    return parts.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildJobSummary(job: any): string {
    const parts: string[] = [];

    parts.push(`Title: ${job.title}`);
    if (job.location) parts.push(`Location: ${job.location}`);
    if (job.mode) parts.push(`Work Mode: ${job.mode}`);
    if (job.experienceLevel) parts.push(`Experience Level: ${job.experienceLevel}`);
    if (job.setting) parts.push(`Clinical Setting: ${job.setting}`);
    if (job.population) parts.push(`Patient Population: ${job.population}`);
    if (job.benefits?.length) parts.push(`Benefits: ${job.benefits.join(', ')}`);
    if (job.state) parts.push(`State: ${job.state}`);

    if (job.description) {
        parts.push(`Job Description:\n${job.description.slice(0, 2000)}`);
    }

    return parts.join('\n');
}
