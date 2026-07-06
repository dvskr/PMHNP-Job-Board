/**
 * Drift guard: vercel.json's per-source cron entries must match the
 * `chunkCount` exported by the corresponding adapter. If a developer
 * changes one without the other, the cron either over-runs (calls a
 * chunk index the adapter ignores) or under-runs (skips work).
 *
 * This test exists because the chunk count lives in three places today
 * (vercel.json schedule + adapter constant + CHUNKED_SOURCE_TOTAL_CHUNKS
 * in lib/health/chunked-presence.ts — the constant behind the 8-vs-4
 * incident documented in that file's header). The eventual refactor is
 * a build step that *generates* vercel.json from the adapter exports;
 * until then this test catches drift.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { GREENHOUSE_TOTAL_CHUNKS } from '@/lib/aggregators/greenhouse';
import { WORKDAY_TOTAL_CHUNKS } from '@/lib/aggregators/workday';
import { CHUNKED_SOURCE_TOTAL_CHUNKS } from '@/lib/health/chunked-presence';

interface CronEntry { path: string; schedule: string }

function loadCronEntries(): CronEntry[] {
    const file = path.join(process.cwd(), 'vercel.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf-8')) as { crons: CronEntry[] };
    return config.crons;
}

function countChunkEntries(crons: CronEntry[], source: string): number {
    const re = new RegExp(`/api/cron/ingest\\?source=${source}&chunk=(\\d+)`);
    const indices = new Set<number>();
    for (const entry of crons) {
        const m = re.exec(entry.path);
        if (m) indices.add(Number(m[1]));
    }
    return indices.size;
}

describe('vercel.json chunk count drift guard', () => {
    const crons = loadCronEntries();

    it('greenhouse: vercel.json schedules match GREENHOUSE_TOTAL_CHUNKS', () => {
        const scheduled = countChunkEntries(crons, 'greenhouse');
        expect(scheduled).toBe(GREENHOUSE_TOTAL_CHUNKS);
    });

    it('workday: vercel.json schedules match WORKDAY_TOTAL_CHUNKS', () => {
        const scheduled = countChunkEntries(crons, 'workday');
        expect(scheduled).toBe(WORKDAY_TOTAL_CHUNKS);
    });

    it('greenhouse: chunked-presence total matches GREENHOUSE_TOTAL_CHUNKS', () => {
        expect(CHUNKED_SOURCE_TOTAL_CHUNKS.greenhouse).toBe(GREENHOUSE_TOTAL_CHUNKS);
    });

    it('workday: chunked-presence total matches WORKDAY_TOTAL_CHUNKS', () => {
        expect(CHUNKED_SOURCE_TOTAL_CHUNKS.workday).toBe(WORKDAY_TOTAL_CHUNKS);
    });
});
