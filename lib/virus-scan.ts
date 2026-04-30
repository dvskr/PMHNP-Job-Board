import { logger } from '@/lib/logger';

/**
 * Resume / file virus scanning.
 *
 * Backed by Cloudmersive's Advanced Virus Scan API. We chose Cloudmersive
 * because:
 *   - It accepts a binary upload directly (no need to host the file
 *     somewhere accessible first), so we can scan in-memory before any
 *     write to Supabase Storage.
 *   - It catches both classic AV signatures and content-based risks
 *     (executables, scripts, macros, password-protected archives).
 *   - The free tier is enough for our resume-upload volume.
 *
 * Configuration:
 *   CLOUDMERSIVE_API_KEY    required for live scanning
 *   VIRUS_SCAN_FAIL_OPEN    if "true" we accept the file when the scan
 *                           service is unavailable. Default false (fail
 *                           closed) — better to surface an upload error
 *                           than silently accept a malicious file.
 *
 * If the API key is missing, scanning is skipped with a structured warn
 * log so the env-misconfiguration is visible without breaking signups.
 */

export interface VirusScanResult {
    clean: boolean;
    /** True when no scan was performed (missing config or transient failure). */
    skipped: boolean;
    /** Detected threats, when the scanner reports any. */
    threats: string[];
    /** Whether the file content failed any of the advanced content checks. */
    contentRisks: {
        executable?: boolean;
        invalidFile?: boolean;
        script?: boolean;
        passwordProtected?: boolean;
        macros?: boolean;
        xmlExternalEntities?: boolean;
    };
    /** Free-text message useful for logs / user messages. */
    message: string;
}

const ENDPOINT = 'https://api.cloudmersive.com/virus/scan/file/advanced';

export async function scanFileForViruses(
    file: Buffer,
    fileName: string,
): Promise<VirusScanResult> {
    const apiKey = process.env.CLOUDMERSIVE_API_KEY;
    const failOpen = process.env.VIRUS_SCAN_FAIL_OPEN === 'true';

    if (!apiKey) {
        logger.warn('virus-scan: CLOUDMERSIVE_API_KEY not configured — skipping scan');
        return {
            clean: true,
            skipped: true,
            threats: [],
            contentRisks: {},
            message: 'Virus scanning not configured.',
        };
    }

    try {
        const form = new FormData();
        form.append('inputFile', new Blob([new Uint8Array(file)]), fileName);

        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                Apikey: apiKey,
                // Refuse anything that looks dangerous — these are the
                // boolean flags Cloudmersive exposes.
                allowExecutables: 'false',
                allowInvalidFiles: 'false',
                allowScripts: 'false',
                allowPasswordProtectedFiles: 'false',
                allowMacros: 'false',
                allowXmlExternalEntities: 'false',
            },
            body: form,
            signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) {
            logger.warn('virus-scan: API returned non-200', { status: res.status });
            return {
                clean: failOpen,
                skipped: !failOpen ? false : true,
                threats: [],
                contentRisks: {},
                message: failOpen
                    ? 'Virus scanner unreachable; upload accepted (fail-open).'
                    : `Virus scanner returned ${res.status}.`,
            };
        }

        type Response = {
            CleanResult?: boolean;
            FoundViruses?: Array<{ FileName?: string; VirusName?: string }>;
            ContainsExecutable?: boolean;
            ContainsInvalidFile?: boolean;
            ContainsScript?: boolean;
            ContainsPasswordProtectedFile?: boolean;
            ContainsMacros?: boolean;
            ContainsXmlExternalEntities?: boolean;
        };
        const data = (await res.json()) as Response;

        const threats =
            data.FoundViruses?.map((v) => v.VirusName ?? 'unknown').filter(Boolean) ?? [];

        const contentRisks = {
            executable: data.ContainsExecutable === true,
            invalidFile: data.ContainsInvalidFile === true,
            script: data.ContainsScript === true,
            passwordProtected: data.ContainsPasswordProtectedFile === true,
            macros: data.ContainsMacros === true,
            xmlExternalEntities: data.ContainsXmlExternalEntities === true,
        };

        const anyContentRisk = Object.values(contentRisks).some(Boolean);
        const clean = data.CleanResult === true && threats.length === 0 && !anyContentRisk;

        return {
            clean,
            skipped: false,
            threats,
            contentRisks,
            message: clean
                ? 'File passed virus scan.'
                : threats.length
                    ? `Threat detected: ${threats.join(', ')}`
                    : 'File contains disallowed content (executable / script / macros / password-protected).',
        };
    } catch (err) {
        logger.error('virus-scan: scan failed', err, { fileName });
        return {
            clean: failOpen,
            skipped: !failOpen ? false : true,
            threats: [],
            contentRisks: {},
            message: failOpen
                ? 'Virus scanner failure; upload accepted (fail-open).'
                : 'Virus scanner failure; upload rejected.',
        };
    }
}
