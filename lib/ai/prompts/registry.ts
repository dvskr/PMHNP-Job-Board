/**
 * Prompt registry — every prompt the gateway uses lives as versioned JSON
 * under lib/ai/prompts/<task>/v<n>.json.
 *
 * Why it exists:
 *   - Versioned via git, no separate DB. `git log lib/ai/prompts/<task>/`
 *     answers "when did this change?" with full author + diff context.
 *   - Eval harness (lib/ai/eval) targets a (task, version) pair so we can
 *     A/B prompts without touching call sites.
 *   - Cost log (`ai_call_log.prompt_id` + `prompt_version`) records exactly
 *     which prompt produced each call — drift detection depends on this.
 *
 * Usage from a caller:
 *
 *     const prompt = await loadPrompt('candidate_scoring');
 *     const result = await complete({
 *         task: prompt.id,
 *         tenant: { ... },
 *         messages: prompt.render({ jobSummary, candidateSummary }),
 *         promptId: prompt.id,
 *         promptVersion: prompt.version,
 *         cacheKey: ['v1', jobId, userId],
 *         outputSchema: scoringResultSchema,
 *     });
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import type { AiMessage, AiTaskId } from '../types';

const promptFileSchema = z.object({
    id: z.string(),
    version: z.string().regex(/^v\d+$/, 'version must look like v1, v2, ...'),
    /** Optional — present when this is a successor of an earlier version. */
    supersedes: z.string().optional(),
    /** Free-form notes for human reviewers. Goes nowhere at runtime. */
    notes: z.string().optional(),
    system: z.string().min(1),
    /** Mustache-style {{key}} placeholders. Missing vars throw at render time. */
    user_template: z.string().min(1),
});

export type PromptFile = z.infer<typeof promptFileSchema>;

export interface LoadedPrompt {
    id: AiTaskId;
    version: string;
    supersedes?: string;
    /**
     * Short sha256 of system + user_template. The gateway appends this to
     * cache keys so ANY content edit to a prompt file invalidates cached
     * responses automatically — `version` stays a human-readable bump.
     * `notes` edits deliberately don't change it (notes never reach runtime).
     */
    contentHash: string;
    /** Render the user template with the provided variables → ready-to-send messages. */
    render(variables: Record<string, string>): AiMessage[];
    /** Unrendered system prompt — useful for tests + diff tooling. */
    rawSystem: string;
    /** Unrendered user template — useful for tests + diff tooling. */
    rawUserTemplate: string;
}

const PROMPTS_DIR = path.join(process.cwd(), 'lib', 'ai', 'prompts');
const cache = new Map<string, LoadedPrompt>();
/** `${id}:${version}` → contentHash. Populated as a side effect of loadPrompt(). */
const contentHashIndex = new Map<string, string>();

function renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => {
        if (!(key in variables)) {
            throw new Error(`Prompt template variable "{{${key}}}" not provided`);
        }
        return variables[key];
    });
}

/**
 * Load and validate a prompt file. Picks the latest version under the task
 * directory unless `version` is pinned. Cached in-process — restart to pick
 * up edits in dev (or call __testing.clearCache from tests).
 */
export async function loadPrompt(task: AiTaskId, version?: string): Promise<LoadedPrompt> {
    const cacheKey = `${task}:${version ?? 'latest'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const dir = path.join(PROMPTS_DIR, task);
    let pinned = version;
    if (!pinned) {
        const entries = await fs.readdir(dir).catch(() => {
            throw new Error(`No prompts registered for task "${task}" — create lib/ai/prompts/${task}/v1.json`);
        });
        const versions = entries
            .filter((f) => /^v\d+\.json$/.test(f))
            .map((f) => f.replace(/\.json$/, ''))
            .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
        if (versions.length === 0) {
            throw new Error(`No prompt files found in lib/ai/prompts/${task}/`);
        }
        pinned = versions[0];
    }

    const file = path.join(dir, `${pinned}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = promptFileSchema.parse(JSON.parse(raw));

    if (parsed.id !== task) {
        throw new Error(`Prompt file ${file} declares id="${parsed.id}" but lives under task="${task}"`);
    }
    if (parsed.version !== pinned) {
        throw new Error(`Prompt file ${file} declares version="${parsed.version}" but filename is "${pinned}"`);
    }

    const contentHash = createHash('sha256')
        .update(`${parsed.system}\n${parsed.user_template}`)
        .digest('hex')
        .slice(0, 12);

    const loaded: LoadedPrompt = {
        id: parsed.id as AiTaskId,
        version: parsed.version,
        supersedes: parsed.supersedes,
        contentHash,
        rawSystem: parsed.system,
        rawUserTemplate: parsed.user_template,
        render(variables) {
            return [
                { role: 'system', content: parsed.system },
                { role: 'user', content: renderTemplate(parsed.user_template, variables) },
            ];
        },
    };
    cache.set(cacheKey, loaded);
    contentHashIndex.set(`${parsed.id}:${parsed.version}`, contentHash);
    contentHashIndex.set(parsed.id, contentHash);
    return loaded;
}

/**
 * Synchronous content-hash lookup for the gateway's cache-key assembly.
 * Populated as a side effect of loadPrompt() — registry-backed callers always
 * load their prompt before calling complete(), so the entry exists by the
 * time the gateway asks. Returns undefined for inline / unregistered prompt
 * ids (those callers keep their cache keys unchanged).
 */
export function getPromptContentHash(promptId: string, version?: string): string | undefined {
    return version
        ? contentHashIndex.get(`${promptId}:${version}`)
        : contentHashIndex.get(promptId);
}

/** List every prompt registered on disk — used by drift / diff tooling. */
export async function listPrompts(): Promise<Array<{ task: string; versions: string[] }>> {
    const entries = await fs.readdir(PROMPTS_DIR, { withFileTypes: true }).catch(() => []);
    const tasks = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const result: Array<{ task: string; versions: string[] }> = [];
    for (const task of tasks) {
        const files = await fs.readdir(path.join(PROMPTS_DIR, task));
        const versions = files
            .filter((f) => /^v\d+\.json$/.test(f))
            .map((f) => f.replace(/\.json$/, ''))
            .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
        if (versions.length > 0) result.push({ task, versions });
    }
    return result;
}

export const __testing = {
    clearCache(): void { cache.clear(); contentHashIndex.clear(); },
    renderTemplate,
};
