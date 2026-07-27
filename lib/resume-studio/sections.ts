/**
 * Resume studio section contract (lib/resume-studio/sections.ts)
 *
 * THE shared shape for ResumeDocument.sections (resume_documents.sections
 * Json column, versioned by contentVersion). Everything that touches a
 * resume document (CRUD routes, PDF rendering, scoring, AI input) goes
 * through this module:
 *
 *   - parseSections()          validate + clamp unknown JSON (DB rows, PATCH bodies)
 *   - seedSectionsFromProfile  build a first draft from the candidate profile
 *   - sectionsToText           deterministic plain text for scoring and AI input
 *   - emptySections            blank but structurally valid starting point
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export interface ResumeContact {
    fullName: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    linkedinUrl: string;
}

export interface ResumeLicense {
    licenseType: string;
    licenseState: string;
    licenseNumber: string;
    expiration: string;
}

export interface ResumeCertification {
    name: string;
    certifyingBody: string;
    expiration: string;
}

export interface ResumeEducation {
    degreeType: string;
    fieldOfStudy: string;
    schoolName: string;
    graduationYear: string;
}

export interface ResumeExperience {
    jobTitle: string;
    employerName: string;
    location: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    bullets: string[];
}

export interface ResumeSections {
    contact: ResumeContact;
    summary: string;
    licenses: ResumeLicense[];
    certifications: ResumeCertification[];
    education: ResumeEducation[];
    experience: ResumeExperience[];
    skills: string[];
}

export const RESUME_CONTENT_VERSION = 1;

// ── Length limits (characters unless noted) ──
const MAX_NAME_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 2000;
const MAX_BULLET_LENGTH = 500;
const MAX_BULLETS_PER_ROLE = 30;
const MAX_ENTRIES_PER_SECTION = 20; // roles, licenses, certifications, education
const MAX_SKILLS = 50;
const MAX_SKILL_LENGTH = 80;
const MAX_FIELD_LENGTH = 200; // generic free-text field (employer, school, cert name)
const MAX_SHORT_FIELD_LENGTH = 40; // state, phone, dates, years
const MAX_URL_LENGTH = 300;

const TAB_CODE = 9;
const NEWLINE_CODE = 10;
const C0_CONTROL_MAX = 31;
const DELETE_CODE = 127;
const C1_CONTROL_MAX = 159;

/** True for C0/C1 control characters, except tab and newline. */
function isDisallowedControlChar(code: number): boolean {
    if (code === TAB_CODE || code === NEWLINE_CODE) return false;
    return code <= C0_CONTROL_MAX || (code >= DELETE_CODE && code <= C1_CONTROL_MAX);
}

function stripControlChars(value: string): string {
    let result = '';
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0;
        if (!isDisallowedControlChar(code)) result += char;
    }
    return result;
}

function cleanString(value: string, maxLength: number): string {
    const normalized = value.replace(/\r\n?/g, '\n');
    return stripControlChars(normalized).trim().slice(0, maxLength);
}

const clamped = (maxLength: number) =>
    z.string().transform((value) => cleanString(value, maxLength));

const cappedArray = <T extends z.ZodTypeAny>(item: T, maxItems: number) =>
    z.array(item).transform((items) => items.slice(0, maxItems));

const contactSchema = z.object({
    fullName: clamped(MAX_NAME_LENGTH),
    email: clamped(MAX_FIELD_LENGTH),
    phone: clamped(MAX_SHORT_FIELD_LENGTH),
    city: clamped(MAX_FIELD_LENGTH),
    state: clamped(MAX_SHORT_FIELD_LENGTH),
    linkedinUrl: clamped(MAX_URL_LENGTH),
});

const licenseSchema = z.object({
    licenseType: clamped(MAX_FIELD_LENGTH),
    licenseState: clamped(MAX_SHORT_FIELD_LENGTH),
    licenseNumber: clamped(MAX_FIELD_LENGTH),
    expiration: clamped(MAX_SHORT_FIELD_LENGTH),
});

const certificationSchema = z.object({
    name: clamped(MAX_FIELD_LENGTH),
    certifyingBody: clamped(MAX_FIELD_LENGTH),
    expiration: clamped(MAX_SHORT_FIELD_LENGTH),
});

const educationSchema = z.object({
    degreeType: clamped(MAX_FIELD_LENGTH),
    fieldOfStudy: clamped(MAX_FIELD_LENGTH),
    schoolName: clamped(MAX_FIELD_LENGTH),
    graduationYear: clamped(MAX_SHORT_FIELD_LENGTH),
});

const experienceSchema = z.object({
    jobTitle: clamped(MAX_FIELD_LENGTH),
    employerName: clamped(MAX_FIELD_LENGTH),
    location: clamped(MAX_FIELD_LENGTH),
    startDate: clamped(MAX_SHORT_FIELD_LENGTH),
    endDate: clamped(MAX_SHORT_FIELD_LENGTH),
    isCurrent: z.boolean(),
    bullets: cappedArray(clamped(MAX_BULLET_LENGTH), MAX_BULLETS_PER_ROLE),
});

const sectionsSchema = z.object({
    contact: contactSchema,
    summary: clamped(MAX_SUMMARY_LENGTH),
    licenses: cappedArray(licenseSchema, MAX_ENTRIES_PER_SECTION),
    certifications: cappedArray(certificationSchema, MAX_ENTRIES_PER_SECTION),
    education: cappedArray(educationSchema, MAX_ENTRIES_PER_SECTION),
    experience: cappedArray(experienceSchema, MAX_ENTRIES_PER_SECTION),
    skills: cappedArray(clamped(MAX_SKILL_LENGTH), MAX_SKILLS),
});

/** A blank but structurally valid sections object. */
export function emptySections(): ResumeSections {
    return {
        contact: { fullName: '', email: '', phone: '', city: '', state: '', linkedinUrl: '' },
        summary: '',
        licenses: [],
        certifications: [],
        education: [],
        experience: [],
        skills: [],
    };
}

/**
 * Validate unknown JSON (DB row, PATCH body) into ResumeSections.
 * Clamps string lengths and array sizes, strips control characters, and
 * drops unknown keys. Throws ZodError when the input is structurally
 * invalid (wrong types, missing fields).
 */
export function parseSections(input: unknown): ResumeSections {
    return sectionsSchema.parse(input);
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a DB date as e.g. "May 2027" (UTC, so serverless TZ never shifts it). */
function formatMonthYear(date: Date | null | undefined): string {
    if (!date) return '';
    return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Split a stored work-experience description back into bullet strings.
 * Descriptions are bullet lines joined with '\n• ' (see htmlToReadableText
 * and the profile UI), so strip the leading markers and drop empty lines.
 */
function descriptionToBullets(description: string | null): string[] {
    if (!description) return [];
    return description
        .split('\n')
        .map((line) => line.replace(/^\s*[•*-]\s*/, '').trim())
        .filter((line) => line.length > 0);
}

/**
 * Build a first-draft ResumeSections from the candidate profile and its
 * candidate_* tables. Missing fields become empty strings, never null.
 * The result is passed through parseSections so all clamps apply.
 */
export async function seedSectionsFromProfile(profileId: string): Promise<ResumeSections> {
    const [profile, licenses, certifications, education, experience] = await Promise.all([
        prisma.userProfile.findUnique({ where: { id: profileId } }),
        prisma.candidateLicense.findMany({
            where: { userId: profileId },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.candidateCertification.findMany({
            where: { userId: profileId },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.candidateEducation.findMany({
            where: { userId: profileId },
            orderBy: [{ isHighestDegree: 'desc' }, { createdAt: 'asc' }],
        }),
        prisma.candidateWorkExperience.findMany({
            where: { userId: profileId },
            orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
        }),
    ]);

    if (!profile) {
        throw new Error(`Cannot seed resume sections: profile ${profileId} not found`);
    }

    const skills: string[] = [];
    const seenSkills = new Set<string>();
    const addSkill = (raw: string) => {
        const skill = raw.trim();
        const key = skill.toLowerCase();
        if (!skill || seenSkills.has(key)) return;
        seenSkills.add(key);
        skills.push(skill);
    };
    for (const skill of profile.skills ?? []) addSkill(skill);
    for (const specialty of (profile.specialties ?? '').split(',')) addSkill(specialty);

    const seeded: ResumeSections = {
        contact: {
            fullName: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
            email: profile.email ?? '',
            phone: profile.phone ?? '',
            city: profile.city ?? '',
            state: profile.state ?? '',
            linkedinUrl: profile.linkedinUrl ?? '',
        },
        summary: profile.bio?.trim() || profile.headline?.trim() || '',
        licenses: licenses.map((license) => ({
            licenseType: license.licenseType ?? '',
            licenseState: license.licenseState ?? '',
            licenseNumber: license.licenseNumber ?? '',
            expiration: formatMonthYear(license.expirationDate),
        })),
        certifications: certifications.map((certification) => ({
            name: certification.certificationName ?? '',
            certifyingBody: certification.certifyingBody ?? '',
            expiration: formatMonthYear(certification.expirationDate),
        })),
        education: education.map((entry) => ({
            degreeType: entry.degreeType ?? '',
            fieldOfStudy: entry.fieldOfStudy ?? '',
            schoolName: entry.schoolName ?? '',
            graduationYear: entry.graduationDate ? String(entry.graduationDate.getUTCFullYear()) : '',
        })),
        experience: experience.map((role) => ({
            jobTitle: role.jobTitle ?? '',
            employerName: role.employerName ?? '',
            location: [role.employerCity, role.employerState].filter(Boolean).join(', '),
            startDate: formatMonthYear(role.startDate),
            endDate: role.isCurrent ? '' : formatMonthYear(role.endDate),
            isCurrent: role.isCurrent ?? false,
            bullets: descriptionToBullets(role.description),
        })),
        skills,
    };

    return parseSections(seeded);
}

function joinParts(parts: string[], separator = ', '): string {
    return parts.filter((part) => part.length > 0).join(separator);
}

function experienceDateRange(role: ResumeExperience): string {
    const end = role.isCurrent ? 'Present' : role.endDate;
    if (role.startDate && end) return `${role.startDate} to ${end}`;
    return role.startDate || end || '';
}

/**
 * Deterministic plain-text serialization of the whole resume. Used as the
 * input for deterministic scoring and AI review/tailoring, so the same
 * sections must always produce byte-identical output.
 */
export function sectionsToText(sections: ResumeSections): string {
    const lines: string[] = [];

    if (sections.contact.fullName) lines.push(sections.contact.fullName);
    const contactLine = joinParts(
        [
            sections.contact.email,
            sections.contact.phone,
            joinParts([sections.contact.city, sections.contact.state]),
            sections.contact.linkedinUrl,
        ],
        ' | ',
    );
    if (contactLine) lines.push(contactLine);

    if (sections.summary) {
        lines.push('', 'SUMMARY', sections.summary);
    }

    if (sections.licenses.length > 0) {
        lines.push('', 'LICENSES');
        for (const license of sections.licenses) {
            lines.push(joinParts([
                license.licenseType,
                license.licenseState,
                license.licenseNumber ? `License ${license.licenseNumber}` : '',
                license.expiration ? `Expires ${license.expiration}` : '',
            ]));
        }
    }

    if (sections.certifications.length > 0) {
        lines.push('', 'CERTIFICATIONS');
        for (const certification of sections.certifications) {
            lines.push(joinParts([
                certification.name,
                certification.certifyingBody,
                certification.expiration ? `Expires ${certification.expiration}` : '',
            ]));
        }
    }

    if (sections.education.length > 0) {
        lines.push('', 'EDUCATION');
        for (const entry of sections.education) {
            const degree = entry.fieldOfStudy
                ? joinParts([entry.degreeType, entry.fieldOfStudy], ' in ')
                : entry.degreeType;
            lines.push(joinParts([degree, entry.schoolName, entry.graduationYear]));
        }
    }

    if (sections.experience.length > 0) {
        lines.push('', 'EXPERIENCE');
        for (const role of sections.experience) {
            lines.push('');
            lines.push(joinParts([role.jobTitle, role.employerName, role.location]));
            const dates = experienceDateRange(role);
            if (dates) lines.push(dates);
            for (const bullet of role.bullets) {
                lines.push(`• ${bullet}`);
            }
        }
    }

    if (sections.skills.length > 0) {
        lines.push('', 'SKILLS', sections.skills.join(', '));
    }

    return lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
