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
    /** Verbatim "Professional Summary" / "Profile" paragraph from the
     *  resume header. Routes to UserProfile.bio. v2 prompt only. */
    professionalSummary?: string;
    /** E.164 or "(555) 555-5555" formatted phone — sanitized to digits with min length. */
    phone?: string;
    /** Public LinkedIn URL (linkedin.com/in/xxx). */
    linkedinUrl?: string;
    yearsExperience?: number;
    /** Flat list of cert names — kept for the CSV column on UserProfile. */
    certifications?: string[];
    /** 2-letter state codes — kept for the CSV column on UserProfile. */
    licenseStates?: string[];
    specialties?: string[];
    skills?: string[];
    npiNumber?: string;
    deaNumber?: string;
    /** Structured license records → CandidateLicense table. */
    licenses?: {
        licenseType: string;
        licenseNumber: string;
        licenseState: string;
        expirationDate?: string;
    }[];
    /** Structured certification records → CandidateCertification table. */
    certificationRecords?: {
        certificationName: string;
        certifyingBody?: string;
        certificationNumber?: string;
        expirationDate?: string;
    }[];
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
        /** Persisted form: bullets joined with '\n• ' for whiteSpace
         *  pre-wrap rendering. The v2 prompt returns these as a string
         *  array (`descriptionBullets`); the sanitizer joins them
         *  here. v1 prompt returned `description` as a single string
         *  which we accept as-is. */
        description?: string;
        practiceSetting?: string;
    }[];
}

/** Extract raw text from a PDF buffer using the pdf-parse v2 PDFParse
 *  class API. v1's default-export-as-function (`pdfParse(buffer)`) was
 *  removed in 2.x — calling the module like a function throws
 *  `TypeError: pdfParse is not a function`, which is what made every
 *  resume upload return 422 before this fix. */
interface PdfParseV2Instance {
    getText: () => Promise<{ text: string }>;
    destroy: () => Promise<void>;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
    let parser: PdfParseV2Instance | null = null;
    try {
        const { PDFParse } = await import('pdf-parse');
        // pdf-parse prefers TypedArrays over Node Buffer for worker
        // memory transfer; Buffer is a Uint8Array subclass but the
        // explicit cast avoids ambiguity in the typed signature.
        parser = new PDFParse({ data: new Uint8Array(buffer) }) as unknown as PdfParseV2Instance;
        const result = await parser.getText();
        return result.text || '';
    } catch (err) {
        logger.error('PDF text extraction failed', err);
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to extract text from PDF: ${detail}`);
    } finally {
        // Release the worker. Swallow destroy errors — the parse result
        // (or the original throw) is what matters.
        if (parser) {
            try { await parser.destroy(); } catch { /* noop */ }
        }
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

/** Loose ISO/`YYYY-MM-DD` / `MM/YYYY` / `YYYY` date string passthrough.
 *  We accept any short-ish string and let downstream code attempt to parse;
 *  the schema's per-row date columns can hold null when parsing fails. */
function sanitizeDateStr(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (s.length === 0 || s.length > 12) return undefined;
    return s;
}

/** Phone — keep digits + common separators, drop anything below 7 digits. */
function sanitizePhone(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const digitCount = (v.match(/\d/g) ?? []).length;
    if (digitCount < 7 || digitCount > 15) return undefined;
    return v.slice(0, 30);
}

/** LinkedIn URL — must be a linkedin.com URL or a partial path. */
function sanitizeLinkedIn(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const s = v.trim().slice(0, 200);
    if (!/linkedin\.com\/(in|pub|profile)\//i.test(s)) return undefined;
    // Normalize to https:// if user wrote "linkedin.com/in/foo" without scheme.
    return s.startsWith('http') ? s : `https://${s.replace(/^\/+/, '')}`;
}

/**
 * Sanitize and validate parsed resume data.
 *
 * EXPORTED so the EEO negative test (Sprint 2.1.P6) can assert the
 * output never includes protected-attribute keys, even when the model
 * returns them. Production code should not call this directly —
 * `parseResume()` is the boundary.
 */
export function sanitizeParsedResume(data: ParsedResume): ParsedResume {
    return {
        firstName: typeof data.firstName === 'string' ? data.firstName.slice(0, 50) : undefined,
        lastName: typeof data.lastName === 'string' ? data.lastName.slice(0, 50) : undefined,
        headline: typeof data.headline === 'string' ? data.headline.slice(0, 120) : undefined,
        // v2 only — verbatim summary paragraph routed to UserProfile.bio.
        professionalSummary: typeof data.professionalSummary === 'string'
            ? data.professionalSummary.slice(0, 1500)
            : undefined,
        phone: sanitizePhone(data.phone),
        linkedinUrl: sanitizeLinkedIn(data.linkedinUrl),
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
        // Structured license records — must have type + number + 2-letter state.
        licenses: Array.isArray(data.licenses)
            ? data.licenses
                  .filter((l) => l
                      && typeof l.licenseType === 'string'
                      && typeof l.licenseNumber === 'string'
                      && typeof l.licenseState === 'string'
                      && l.licenseState.length === 2)
                  .slice(0, 20)
                  .map((l) => ({
                      licenseType: l.licenseType.slice(0, 50),
                      licenseNumber: l.licenseNumber.slice(0, 50),
                      licenseState: l.licenseState.toUpperCase(),
                      expirationDate: sanitizeDateStr(l.expirationDate),
                  }))
            : [],
        // Structured certification records — name is the only required field.
        certificationRecords: Array.isArray(data.certificationRecords)
            ? data.certificationRecords
                  .filter((c) => c && typeof c.certificationName === 'string')
                  .slice(0, 15)
                  .map((c) => ({
                      certificationName: c.certificationName.slice(0, 100),
                      certifyingBody: typeof c.certifyingBody === 'string' ? c.certifyingBody.slice(0, 100) : undefined,
                      certificationNumber: typeof c.certificationNumber === 'string' ? c.certificationNumber.slice(0, 50) : undefined,
                      expirationDate: sanitizeDateStr(c.expirationDate),
                  }))
            : [],
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
                      // v2 prompt: descriptionBullets is an array of
                      // verbatim bullets — join with newline + bullet
                      // marker for whiteSpace: pre-wrap rendering. v1
                      // returned a single `description` string; fall
                      // through if descriptionBullets is missing.
                      description: bulletsToDescription(w),
                      practiceSetting: typeof w.practiceSetting === 'string' ? w.practiceSetting.slice(0, 50) : undefined,
                  }))
            : [],
    };
}

/** v2: descriptionBullets[] → "• line\n• line"; v1: description string → as-is. */
function bulletsToDescription(w: unknown): string | undefined {
    const we = w as { description?: unknown; descriptionBullets?: unknown };
    const bullets = we.descriptionBullets;
    if (Array.isArray(bullets)) {
        const lines = bullets
            .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
            .slice(0, 12)
            .map((b) => '• ' + b.trim().slice(0, 400));
        if (lines.length > 0) return lines.join('\n').slice(0, 2500);
    }
    if (typeof we.description === 'string') return we.description.slice(0, 2500);
    return undefined;
}
