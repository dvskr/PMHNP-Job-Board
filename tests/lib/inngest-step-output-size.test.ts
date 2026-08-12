/**
 * Step-output-size discipline for lib/inngest/functions/*.
 *
 * Inngest persists EVERY step.run() return value as durable run state and
 * rejects a step whose serialized output exceeds the per-step size cap,
 * failing the whole run with:
 *
 *   error validating generator opcode <hash>: step output size is greater
 *   than the limit
 *
 * That is what silently killed `recommendations-daily`: its opening step
 * returned one row per candidate carrying `embedding::text`, and a
 * 1536-dimension pgvector serializes to roughly 19 KB of text, so the step
 * output grew linearly with the candidate base until it blew the cap.
 *
 * Two halves to this file:
 *   1. Unit tests for the pure fold / parse logic extracted during the fix.
 *   2. A source lock that re-reads the function files and fails if a step
 *      ever again returns an embedding vector or a full row collection, or
 *      folds an aggregate by mutating a closure counter.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import {
    foldTallies,
    emptyTally,
    parseVectorLiteral,
    parseLicenseStates,
    type CandidateTally,
} from '@/lib/inngest/functions/recommendations';
import {
    foldDigestOutcomes,
    type DigestOutcome,
} from '@/lib/inngest/functions/recommendation-digest';

const FUNCTIONS_DIR = path.join(process.cwd(), 'lib', 'inngest', 'functions');

const GRANTED_FILES = [
    'recommendations.ts',
    'recommendation-digest.ts',
    'embeddings.ts',
    'employer-published.ts',
    'fp-recovery.ts',
    'eval-drift.ts',
] as const;

function readFn(file: string): string {
    return readFileSync(path.join(FUNCTIONS_DIR, file), 'utf8');
}

// ── source scanner ───────────────────────────────────────────────────────
// A small brace-matching scanner. Enough to isolate each step.run callback
// body and the expressions it returns, without pulling in a TS parser.

interface StepBody {
    /** The literal step id as written (template placeholders left intact). */
    id: string;
    /** Full source text of the callback body. */
    body: string;
    /** Source text of each `return` expression in the body. */
    returns: string[];
}

/** Advance past a string / template literal / comment starting at `i`. */
function skipAtomic(src: string, i: number): number | null {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        return nl === -1 ? src.length : nl;
    }
    if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        return end === -1 ? src.length : end + 2;
    }
    if (c === '"' || c === "'" || c === '`') {
        let j = i + 1;
        while (j < src.length) {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === c) return j + 1;
            j += 1;
        }
        return src.length;
    }
    return null;
}

/** Index just past the `}` matching the `{` at `open`. */
function matchBrace(src: string, open: number): number {
    let depth = 0;
    let i = open;
    while (i < src.length) {
        const skipped = skipAtomic(src, i);
        if (skipped !== null) { i = skipped; continue; }
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') {
            depth -= 1;
            if (depth === 0) return i + 1;
        }
        i += 1;
    }
    return src.length;
}

/** Index just past the `)` matching the `(` at `open`. */
function matchParen(src: string, open: number): number {
    let depth = 0;
    let i = open;
    while (i < src.length) {
        const skipped = skipAtomic(src, i);
        if (skipped !== null) { i = skipped; continue; }
        if (src[i] === '(') depth += 1;
        else if (src[i] === ')') {
            depth -= 1;
            if (depth === 0) return i + 1;
        }
        i += 1;
    }
    return src.length;
}

/** Extract the source text of every `return` expression at any depth. */
function extractReturns(body: string): string[] {
    const out: string[] = [];
    const re = /\breturn\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        let i = m.index + m[0].length;
        // Scan to the `;` that terminates the expression at depth 0.
        let depth = 0;
        const start = i;
        while (i < body.length) {
            const skipped = skipAtomic(body, i);
            if (skipped !== null) { i = skipped; continue; }
            const c = body[i];
            if (c === '(' || c === '{' || c === '[') depth += 1;
            else if (c === ')' || c === '}' || c === ']') {
                if (depth === 0) break; // end of an enclosing block
                depth -= 1;
            } else if ((c === ';' || c === '\n') && depth === 0) {
                if (c === ';') break;
                // A bare `return` followed by a newline is `return undefined`.
                if (body.slice(start, i).trim() === '') break;
            }
            i += 1;
        }
        out.push(body.slice(start, i).trim());
    }
    return out;
}

/** Remove line and block comments so prose about a hazard is not read as one. */
function stripComments(src: string): string {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
            i = skipAtomic(src, i) ?? src.length;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            const end = skipAtomic(src, i) ?? src.length;
            out += src.slice(i, end);
            i = end;
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

/** The column list of the first SELECT in a SQL string, lower-cased. */
function selectClause(sql: string): string {
    const m = /select\s+(?:distinct\s+)?([\s\S]*?)\sfrom\s/i.exec(sql);
    return m ? m[1].replace(/\s+/g, ' ').trim().toLowerCase() : '';
}

function extractSteps(src: string): StepBody[] {
    const out: StepBody[] = [];
    const marker = 'step.run(';
    let from = 0;
    for (;;) {
        const idx = src.indexOf(marker, from);
        if (idx === -1) break;
        const openParen = idx + marker.length - 1;
        const callEnd = matchParen(src, openParen);
        const call = src.slice(openParen + 1, callEnd - 1);

        const idMatch = /^\s*([`'"])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(call);
        const id = idMatch ? idMatch[2] : '(unknown)';

        const arrow = call.indexOf('=>');
        let body = '';
        if (arrow !== -1) {
            let j = arrow + 2;
            while (j < call.length && /\s/.test(call[j])) j += 1;
            if (call[j] === '{') {
                body = call.slice(j, matchBrace(call, j));
            } else {
                body = call.slice(j); // concise expression body
            }
        }

        const isConcise = !body.trimStart().startsWith('{');
        out.push({
            id,
            body,
            returns: isConcise ? [body.trim().replace(/,\s*$/, '')] : extractReturns(body),
        });
        from = callEnd;
    }
    return out;
}

// ── 1. pure logic ────────────────────────────────────────────────────────

describe('foldTallies', () => {
    const tally = (written: number, easy: number, direct: number, ext: number): CandidateTally => ({
        written,
        tiers: { easy_apply: easy, direct_apply: direct, external: ext },
    });

    it('returns a zeroed tally for an empty run', () => {
        expect(foldTallies([])).toEqual(emptyTally());
    });

    it('sums written counts and per-tier counts across candidates', () => {
        const result = foldTallies([tally(3, 1, 2, 0), tally(2, 0, 1, 1), tally(0, 0, 0, 0)]);

        expect(result.written).toBe(5);
        expect(result.tiers).toEqual({ easy_apply: 1, direct_apply: 3, external: 1 });
    });

    it('does not mutate the tallies it folds', () => {
        const a = tally(3, 1, 2, 0);
        const b = tally(2, 0, 1, 1);

        foldTallies([a, b]);

        expect(a).toEqual(tally(3, 1, 2, 0));
        expect(b).toEqual(tally(2, 0, 1, 1));
    });

    it('returns a fresh object each call so totals cannot leak between runs', () => {
        const first = foldTallies([tally(4, 4, 0, 0)]);
        const second = foldTallies([]);

        expect(first.written).toBe(4);
        expect(second.written).toBe(0);
        expect(second).not.toBe(first);
    });

    it('ignores malformed entries rather than throwing', () => {
        // Values come back from Inngest's durable store and may have been
        // written by an older deploy mid-run.
        const dodgy = [
            tally(2, 2, 0, 0),
            undefined as unknown as CandidateTally,
            { written: Number.NaN, tiers: { easy_apply: 1, direct_apply: 0, external: 0 } } as CandidateTally,
            { written: 1 } as unknown as CandidateTally,
        ];

        const result = foldTallies(dodgy);

        expect(result.written).toBe(3);
        expect(result.tiers.easy_apply).toBe(3);
    });
});

describe('foldDigestOutcomes', () => {
    it('counts each outcome into its own bucket', () => {
        const outcomes: DigestOutcome[] = [
            'sent', 'sent', 'skipped_flag', 'no_recs', 'gone', 'error', 'sent',
        ];

        expect(foldDigestOutcomes(outcomes)).toEqual({
            sent: 3, skippedFlag: 1, noRecs: 1, gone: 1, errored: 1,
        });
    });

    it('returns zeros for an empty run', () => {
        expect(foldDigestOutcomes([])).toEqual({
            sent: 0, skippedFlag: 0, noRecs: 0, gone: 0, errored: 0,
        });
    });

    it('ignores unrecognised outcome strings', () => {
        const outcomes = ['sent', 'something_else'] as unknown as DigestOutcome[];

        expect(foldDigestOutcomes(outcomes).sent).toBe(1);
    });
});

describe('parseVectorLiteral', () => {
    it('parses a bracketed pgvector literal into floats', () => {
        expect(parseVectorLiteral('[0.5,-0.25,1]')).toEqual([0.5, -0.25, 1]);
    });

    it('tolerates whitespace between components', () => {
        expect(parseVectorLiteral('[0.5, -0.25 , 1]')).toEqual([0.5, -0.25, 1]);
    });

    it('drops non-finite components instead of emitting NaN', () => {
        expect(parseVectorLiteral('[1,abc,2]')).toEqual([1, 2]);
    });

    it('returns an empty array for null, undefined and empty input', () => {
        expect(parseVectorLiteral(null)).toEqual([]);
        expect(parseVectorLiteral(undefined)).toEqual([]);
        expect(parseVectorLiteral('')).toEqual([]);
    });

    it('round-trips a full 1536-dimension vector', () => {
        const dims = Array.from({ length: 1536 }, (_, i) => i / 1536);
        expect(parseVectorLiteral(`[${dims.join(',')}]`)).toHaveLength(1536);
    });
});

describe('parseLicenseStates', () => {
    it('upper-cases and trims two-letter codes', () => {
        expect(parseLicenseStates(' ca , tx ')).toEqual(['CA', 'TX']);
    });

    it('drops entries that are not two-letter codes', () => {
        expect(parseLicenseStates('CA,California,T,TX')).toEqual(['CA', 'TX']);
    });

    it('returns an empty array for null or empty input', () => {
        expect(parseLicenseStates(null)).toEqual([]);
        expect(parseLicenseStates('')).toEqual([]);
    });
});

// ── 2. serialized payload budget ─────────────────────────────────────────

describe('step payload budget', () => {
    // Inngest's documented per-step output cap. The exact number is enforced
    // server-side; 4 MB is the published limit and the arithmetic below shows
    // the old shape blew straight past it.
    const STEP_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;
    const EMBEDDING_DIMS = 1536;

    it('a per-candidate tally serializes to well under a kilobyte', () => {
        const payload = JSON.stringify({
            written: 8,
            tiers: { easy_apply: 3, direct_apply: 4, external: 1 },
        });

        expect(payload.length).toBeLessThan(200);
    });

    it('an id-only roster stays tiny even at the per-run candidate cap', () => {
        const ids = Array.from({ length: 750 }, () => '00000000-0000-4000-8000-000000000000');

        expect(JSON.stringify({ ids, eligibleTotal: 750 }).length).toBeLessThan(64 * 1024);
    });

    it('proves the regression: rows carrying an embedding blow the cap at a few hundred candidates', () => {
        // A 1536-dimension vector rendered by `embedding::text`.
        const vectorText = `[${Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i / EMBEDDING_DIMS).toFixed(8)).join(',')}]`;
        const rowBytes = JSON.stringify({
            supabase_id: '00000000-0000-4000-8000-000000000000',
            embedding_text: vectorText,
            license_states: 'CA,TX',
        }).length;

        // One row alone is multiple KB...
        expect(rowBytes).toBeGreaterThan(10 * 1024);
        // ...so a few hundred of them exceed the per-step cap on their own.
        const candidatesToBreak = Math.ceil(STEP_OUTPUT_LIMIT_BYTES / rowBytes);
        expect(candidatesToBreak).toBeLessThan(500);
    });
});

// ── 3. source lock ───────────────────────────────────────────────────────

describe('source lock: steps return ids, counts and compact scalars', () => {
    it.each(GRANTED_FILES)('%s has at least one parseable step', (file) => {
        // Guards the scanner itself: a silently-empty extraction would make
        // every assertion below vacuously pass.
        expect(extractSteps(readFn(file)).length).toBeGreaterThan(0);
    });

    it.each(GRANTED_FILES)('%s never returns an embedding vector from a step', (file) => {
        for (const step of extractSteps(readFn(file))) {
            for (const raw of step.returns) {
                // Helpers whose NAME contains "embedding" but whose RESULT is
                // bounded: the text builders return prose capped by their own
                // slices, the upserts return `{ updated: boolean }`. Neither
                // hands back a vector, so neither is the hazard.
                const expr = raw
                    .replace(/build\w*EmbeddingText/g, 'buildText')
                    .replace(/upsert\w*Embedding/g, 'upsertRow');
                expect(
                    /embedding/i.test(expr),
                    `step "${step.id}" in ${file} returns something embedding-shaped: ${raw.slice(0, 120)}`,
                ).toBe(false);
            }
        }
    });

    it.each(GRANTED_FILES)('%s never returns a raw row collection from a step', (file) => {
        // `findMany` / `$queryRaw*` / `$transaction` results are unbounded by
        // construction. A `findUnique` with an explicit narrow select is fine.
        const forbidden = [/\.findMany\s*\(/, /\$queryRaw(Unsafe)?\s*[<(]/, /\$transaction\s*\(/];
        for (const step of extractSteps(readFn(file))) {
            for (const expr of step.returns) {
                for (const pattern of forbidden) {
                    expect(
                        pattern.test(expr),
                        `step "${step.id}" in ${file} returns a raw query result (${pattern}): ${expr.slice(0, 120)}`,
                    ).toBe(false);
                }
            }
        }
    });

    it('recommendations.ts reads embedding text only inside the per-candidate step', () => {
        const steps = extractSteps(readFn('recommendations.ts'));
        const readers = steps.filter((s) => s.body.includes('embedding::text'));

        expect(readers.length).toBeGreaterThan(0);
        for (const step of readers) {
            expect(
                step.id.startsWith('recommend-'),
                `step "${step.id}" loads embedding text outside the consumer step`,
            ).toBe(true);
        }
    });

    it('recommendations.ts roster step selects the id column only', () => {
        const roster = extractSteps(readFn('recommendations.ts')).find((s) => s.id === 'list-candidate-ids');

        expect(roster).toBeDefined();
        const columns = selectClause(roster!.body);
        expect(columns).toBe('ce.supabase_id');
        // Belt and braces: the vector column is never read in this step.
        expect(roster!.body).not.toMatch(/embedding::text/i);
        expect(roster!.body).not.toMatch(/ce\.embedding\b/);
    });

    it('recommendation-digest.ts roster step selects the id column only, no addresses or tokens', () => {
        const roster = extractSteps(readFn('recommendation-digest.ts'))
            .find((s) => s.id === 'list-eligible-candidate-ids');

        expect(roster).toBeDefined();
        const columns = selectClause(roster!.body);
        expect(columns).toBe('up.supabase_id');
        expect(columns).not.toMatch(/unsubscribe_token|first_name|email/);
    });

    it.each([
        ['recommendations.ts', 'list-candidate-ids'],
        ['recommendation-digest.ts', 'list-eligible-candidate-ids'],
    ])('%s roster step caps the number of per-candidate steps it fans out', (file, stepId) => {
        // Output size was only half the hazard. Each roster id becomes one
        // step, and Inngest caps the steps a single run may take, so an
        // uncapped roster turns "the candidate base grew" into "the pipeline
        // stopped" with no warning: the same class of failure, one boundary
        // over. Both rosters must carry a LIMIT and an explicit ORDER BY so
        // truncation is bounded AND fair rather than arbitrary.
        const roster = extractSteps(readFn(file)).find((s) => s.id === stepId);

        expect(roster).toBeDefined();
        expect(roster!.body, `${stepId} has no LIMIT`).toMatch(/\bLIMIT\s+\$\{MAX_CANDIDATES_PER_RUN\}/);
        expect(roster!.body, `${stepId} has no ORDER BY`).toMatch(/\bORDER BY\b/i);
    });

    it('recommendations.ts clears the batch before writing, so a step retry cannot double-write', () => {
        // Inngest retries a step whose result never made it back even though
        // its body ran. Without this clear the retry finds its own rows inside
        // the dedupe window, picks a DIFFERENT set, and appends it to the same
        // batch: 2N rows and two rank-1 entries for one candidate.
        const step = extractSteps(readFn('recommendations.ts')).find((s) => s.id.startsWith('recommend-'));

        expect(step).toBeDefined();
        const clear = /candidateRecommendation\.deleteMany\(\{\s*where:\s*\{\s*supabaseId,\s*batchId:\s*batch\.batchId/;
        expect(
            clear.test(step!.body),
            'per-candidate step must clear (supabaseId, batchId) before it writes',
        ).toBe(true);
        // ...and it must happen BEFORE the insert, or the retry still appends.
        expect(step!.body.search(clear)).toBeLessThan(step!.body.indexOf('$transaction'));
    });

    it.each(GRANTED_FILES)('%s folds aggregates from step return values, not closure counters', (file) => {
        // A counter mutated inside a step body is reset on every Inngest
        // replay, so only increments from the final request survive. Any `+=`
        // target must be declared inside the same step body.
        for (const step of extractSteps(readFn(file))) {
            const assignments = [...step.body.matchAll(/(\w+)(?:\.\w+|\[[^\]]*\])*\s*\+=/g)];
            for (const [, root] of assignments) {
                const declared = new RegExp(`\\b(?:const|let|var)\\s+(?:\\{[^}]*\\b${root}\\b[^}]*\\}|${root}\\b)`)
                    .test(step.body);
                expect(
                    declared,
                    `step "${step.id}" in ${file} mutates outer counter "${root}"; return the count instead`,
                ).toBe(true);
            }
        }
    });

    it('recommendations.ts mints its batch id inside a step', () => {
        // Minted at the top level, `crypto.randomUUID()` is re-rolled on every
        // Inngest replay and one run scatters its rows across several batch ids.
        const src = stripComments(readFn('recommendations.ts'));
        const steps = extractSteps(src);
        const minting = steps.filter((s) => s.body.includes('randomUUID'));

        expect(minting.length).toBe(1);
        expect(minting[0].id).toBe('open-batch');
        // And nowhere else in the module body.
        const outsideSteps = steps.reduce((acc, s) => acc.replace(s.body, ''), src);
        expect(outsideSteps).not.toMatch(/randomUUID/);
    });
});
