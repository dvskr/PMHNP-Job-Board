import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════
// AI Resume Parser — Extracts structured data from PDF/DOCX
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

/**
 * Extract raw text from a PDF buffer
 */
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

/**
 * Extract raw text from a DOCX buffer
 */
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

/**
 * Extract text from a resume buffer based on content type
 */
export async function extractResumeText(
  buffer: Buffer,
  contentType: string
): Promise<string> {
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

const PARSE_PROMPT = `You are an expert PMHNP (Psychiatric Mental Health Nurse Practitioner) resume parser.
Extract the following structured data from this resume text. Return ONLY valid JSON with no explanation.

Required JSON structure:
{
  "firstName": "string or null",
  "lastName": "string or null",
  "headline": "A concise professional headline, e.g. 'Board-Certified PMHNP | 7 Years Experience' (max 120 chars) or null",
  "yearsExperience": number or null,
  "certifications": ["PMHNP-BC", "ANCC", etc.] or [],
  "licenseStates": ["CA", "TX", etc. — use 2-letter state codes] or [],
  "specialties": ["Addiction Psychiatry", "Child/Adolescent", etc.] or [],
  "skills": ["Telepsychiatry", "CBT", "DBT", "Psychopharmacology", etc.] or [],
  "npiNumber": "string or null",
  "deaNumber": "string or null",
  "education": [
    {
      "degreeType": "MSN, DNP, PhD, BSN, etc.",
      "fieldOfStudy": "Psychiatric Mental Health, Nursing, etc. or null",
      "schoolName": "University name",
      "graduationYear": number or null
    }
  ] or [],
  "workExperience": [
    {
      "jobTitle": "PMHNP, Psychiatric NP, etc.",
      "employerName": "Company/Hospital name",
      "startDate": "YYYY-MM or YYYY format or null",
      "endDate": "YYYY-MM or YYYY format or null (null if current)",
      "isCurrent": boolean,
      "description": "Brief 1-2 sentence summary of responsibilities or null",
      "practiceSetting": "Outpatient, Inpatient, Community Mental Health, Private Practice, Telehealth, etc. or null"
    }
  ] or []
}

Important rules:
- For yearsExperience, calculate from the earliest relevant clinical position
- For licenseStates, only include US state codes where they hold/held nursing licenses
- For certifications, include board certifications and notable credentials
- For specialties, focus on psychiatric/mental health specializations
- Return empty arrays instead of null for array fields
- Return null for fields you cannot determine from the text
- Do NOT fabricate data — only include what is clearly stated in the resume`;

/**
 * Parse a resume using OpenAI GPT-4o-mini
 */
export async function parseResume(buffer: Buffer, contentType: string): Promise<ParsedResume> {
  const text = await extractResumeText(buffer, contentType);

  if (!text || text.trim().length < 50) {
    throw new Error('Resume text is too short or empty');
  }

  // Truncate very long resumes to stay within token limits
  const truncated = text.slice(0, 12000);

  const { OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PARSE_PROMPT },
      { role: 'user', content: `Parse this resume:\n\n${truncated}` },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  try {
    const parsed = JSON.parse(content) as ParsedResume;
    return sanitizeParsedResume(parsed);
  } catch {
    logger.error('Failed to parse OpenAI response as JSON', { content });
    throw new Error('Failed to parse AI response');
  }
}

/**
 * Sanitize and validate parsed resume data
 */
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
