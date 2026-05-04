import { z } from 'zod';
import { logger } from '@/lib/logger';
import { complete } from '@/lib/ai/gateway';
import { loadPrompt } from '@/lib/ai/prompts/registry';
import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════
// AI Resume Parser — Extracts structured data from PDF/DOCX
// Routes through lib/ai/gateway for cost tracking, caching, fallback.
// ═══════════════════════════════════════════════════════════════

export interface ParsedResume {
    firstName?: string;
    lastName?: string;
    headline?: string;
    yearsExperience?: number;
    certifications?: string[];
    licenseStates?: string[];
    specialties?: string[];
    skills?: string[];
    npiNumber?: string;
    deaNumber?: string;
    education?: {
        degreeType: string;
        fieldOfStudy?: string;
        schoolName: string;
        graduationYear?: number;
    }[];
    workExperience?: {
        jobTitle: string;
        employerName: string;
        startDate?: string;
        endDate?: string;
        isCurrent?: boolean;
        description?: string;
        practiceSetting?: string;
    }[];
}

/** Extract raw text from a PDF buffer. */
async function extractPdfText(buffer: Buffer): Promise<string> {
    try {
        // pdf-parse is CJS-only, use require for Next.js compatibility
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text || '';
    } catch (err) {
        logger.error('PDF text extraction failed', err);
        throw new Error('Failed to extract text from PDF');
    }
}

/** Extract raw text from a DOCX buffer. */
async function extractDocxText(buffer: Buffer): Promise<string> {
    try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
    } catch (err) {
        logger.error('DOCX text extraction failed', err);
        throw new Error('Failed to extract text from DOCX');
    }
}

/** Extract text from a resume buffer based on content type. */
export async function extractResumeText(buffer: Buffer, contentType: string): Promise<string> {
    if (contentType === 'application/pdf' || contentType.includes('pdf')) {
        return extractPdfText(buffer);
    }
    if (
        contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        contentType === 'application/msword' ||
        contentType.includes('word')
    ) {
        return extractDocxText(buffer);
    }
    throw new Error(`Unsupported file type: ${contentType}`);
}

// Prompt lives in lib/ai/prompts/resume_parsing/v1.json (Sprint 0.2 registry).

// Permissive schema — accept whatever the model returns, sanitize after.
// Strict typing on every nested field makes the model fight Zod.
const parsedResumeRawSchema = z.record(z.string(), z.unknown());

/**
 * Parse a resume using the LLM Gateway.
 * @param userId Stable identifier of the candidate uploading — used for rate limit + cost attribution.
 */
export async function parseResume(
    buffer: Buffer,
    contentType: string,
    userId: string,
): Promise<ParsedResume> {
    const text = await extractResumeText(buffer, contentType);

    if (!text || text.trim().length < 50) {
        throw new Error('Resume text is too short or empty');
    }

    // Truncate very long resumes to stay within token limits.
    const truncated = text.slice(0, 12_000);
    const contentHash = createHash('sha256').update(truncated).digest('hex').slice(0, 16);

    const prompt = await loadPrompt('resume_parsing');
    const result = await complete({
        task: 'resume_parsing',
        tenant: { type: 'candidate', id: userId },
        messages: prompt.render({ resumeText: truncated }),
        promptId: prompt.id,
        promptVersion: prompt.version,
        // Cache by content hash + prompt version so a prompt rollout invalidates
        // every cached parse for that file automatically.
        cacheKey: ['parse', prompt.version, contentHash],
        outputSchema: parsedResumeRawSchema,
    });

    return sanitizeParsedResume((result.parsed ?? {}) as ParsedResume);
}

/** Sanitize and validate parsed resume data. */
function sanitizeParsedResume(data: ParsedResume): ParsedResume {
    return {
        firstName: typeof data.firstName === 'string' ? data.firstName.slice(0, 50) : undefined,
        lastName: typeof data.lastName === 'string' ? data.lastName.slice(0, 50) : undefined,
        headline: typeof data.headline === 'string' ? data.headline.slice(0, 120) : undefined,
        yearsExperience:
            typeof data.yearsExperience === 'number' && data.yearsExperience >= 0 && data.yearsExperience <= 50
                ? Math.round(data.yearsExperience)
                : undefined,
        certifications: Array.isArray(data.certifications)
            ? data.certifications.filter((c): c is string => typeof c === 'string').slice(0, 20)
            : [],
        licenseStates: Array.isArray(data.licenseStates)
            ? data.licenseStates.filter((s): s is string => typeof s === 'string' && s.length === 2).slice(0, 50)
            : [],
        specialties: Array.isArray(data.specialties)
            ? data.specialties.filter((s): s is string => typeof s === 'string').slice(0, 15)
            : [],
        skills: Array.isArray(data.skills)
            ? data.skills.filter((s): s is string => typeof s === 'string').slice(0, 30)
            : [],
        npiNumber: typeof data.npiNumber === 'string' && /^\d{10}$/.test(data.npiNumber) ? data.npiNumber : undefined,
        deaNumber: typeof data.deaNumber === 'string' && data.deaNumber.length <= 15 ? data.deaNumber : undefined,
        education: Array.isArray(data.education)
            ? data.education
                  .filter((e) => e && typeof e.schoolName === 'string' && typeof e.degreeType === 'string')
                  .slice(0, 5)
                  .map((e) => ({
                      degreeType: e.degreeType.slice(0, 50),
                      fieldOfStudy: typeof e.fieldOfStudy === 'string' ? e.fieldOfStudy.slice(0, 100) : undefined,
                      schoolName: e.schoolName.slice(0, 100),
                      graduationYear:
                          typeof e.graduationYear === 'number' && e.graduationYear > 1950 && e.graduationYear <= new Date().getFullYear() + 5
                              ? e.graduationYear
                              : undefined,
                  }))
            : [],
        workExperience: Array.isArray(data.workExperience)
            ? data.workExperience
                  .filter((w) => w && typeof w.jobTitle === 'string' && typeof w.employerName === 'string')
                  .slice(0, 10)
                  .map((w) => ({
                      jobTitle: w.jobTitle.slice(0, 100),
                      employerName: w.employerName.slice(0, 100),
                      startDate: typeof w.startDate === 'string' ? w.startDate.slice(0, 10) : undefined,
                      endDate: typeof w.endDate === 'string' ? w.endDate.slice(0, 10) : undefined,
                      isCurrent: typeof w.isCurrent === 'boolean' ? w.isCurrent : false,
                      description: typeof w.description === 'string' ? w.description.slice(0, 500) : undefined,
                      practiceSetting: typeof w.practiceSetting === 'string' ? w.practiceSetting.slice(0, 50) : undefined,
                  }))
            : [],
    };
}
