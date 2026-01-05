/**
 * Input Sanitization Utilities
 * 
 * Provides defense-in-depth against XSS and injection attacks.
 * While Prisma handles SQL injection and React handles XSS in JSX,
 * this provides additional safety for edge cases.
 */

/**
 * HTML entities to encode
 */
const HTML_ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(input: string): string {
    return input.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove HTML tags from input
 */
export function stripHtml(input: string): string {
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/**
 * Remove potentially dangerous patterns from URLs
 */
export function sanitizeUrl(url: string): string {
    const trimmed = url.trim();

    // Block javascript: protocol
    if (/^javascript:/i.test(trimmed)) {
        return '';
    }

    // Block data: URLs with scripts
    if (/^data:text\/html/i.test(trimmed)) {
        return '';
    }

    // Allow only http, https, mailto protocols
    if (!/^(https?:\/\/|mailto:)/i.test(trimmed) && !trimmed.startsWith('/')) {
        return '';
    }

    return trimmed;
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
    return email.toLowerCase().trim().slice(0, 254);
}

/**
 * Sanitize a general text field
 * Removes dangerous HTML but preserves line breaks and basic formatting
 */
export function sanitizeText(input: string, maxLength = 10000): string {
    let sanitized = input
        // Remove script tags and their content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove event handlers
        .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
        // Remove javascript: URLs
        .replace(/javascript:/gi, '')
        // Trim whitespace
        .trim();

    // Limit length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.slice(0, maxLength);
    }

    return sanitized;
}

/**
 * Sanitize a job posting object
 */
export interface JobPostingInput {
    title: string;
    employer: string;
    location: string;
    description: string;
    applyLink: string;
    contactEmail: string;
    mode?: string;
    jobType?: string;
    companyWebsite?: string;
    minSalary?: string | number;
    maxSalary?: string | number;
    salaryPeriod?: string;
}

export function sanitizeJobPosting(input: JobPostingInput): JobPostingInput {
    return {
        title: sanitizeText(input.title, 200),
        employer: sanitizeText(input.employer, 200),
        location: sanitizeText(input.location, 200),
        description: sanitizeText(input.description, 50000),
        applyLink: sanitizeUrl(input.applyLink),
        contactEmail: sanitizeEmail(input.contactEmail),
        mode: input.mode ? sanitizeText(input.mode, 50) : undefined,
        jobType: input.jobType ? sanitizeText(input.jobType, 50) : undefined,
        companyWebsite: input.companyWebsite ? sanitizeUrl(input.companyWebsite) : undefined,
        minSalary: input.minSalary,
        maxSalary: input.maxSalary,
        salaryPeriod: input.salaryPeriod ? sanitizeText(input.salaryPeriod, 20) : undefined,
    };
}

/**
 * Sanitize contact form input
 */
export interface ContactFormInput {
    name: string;
    email: string;
    subject?: string;
    message: string;
}

export function sanitizeContactForm(input: ContactFormInput): ContactFormInput {
    return {
        name: sanitizeText(input.name, 100),
        email: sanitizeEmail(input.email),
        subject: input.subject ? sanitizeText(input.subject, 200) : undefined,
        message: sanitizeText(input.message, 5000),
    };
}

/**
 * Sanitize job alert input
 */
export interface JobAlertInput {
    email: string;
    name?: string;
    keyword?: string;
    location?: string;
    mode?: string;
    jobType?: string;
    minSalary?: number;
    maxSalary?: number;
    frequency?: string;
}

export function sanitizeJobAlert(input: JobAlertInput): JobAlertInput {
    return {
        email: sanitizeEmail(input.email),
        name: input.name ? sanitizeText(input.name, 100) : undefined,
        keyword: input.keyword ? sanitizeText(input.keyword, 100) : undefined,
        location: input.location ? sanitizeText(input.location, 200) : undefined,
        mode: input.mode ? sanitizeText(input.mode, 50) : undefined,
        jobType: input.jobType ? sanitizeText(input.jobType, 50) : undefined,
        minSalary: input.minSalary,
        maxSalary: input.maxSalary,
        frequency: input.frequency ? sanitizeText(input.frequency, 20) : undefined,
    };
}

export default {
    escapeHtml,
    stripHtml,
    sanitizeUrl,
    sanitizeEmail,
    sanitizeText,
    sanitizeJobPosting,
    sanitizeContactForm,
    sanitizeJobAlert,
};
