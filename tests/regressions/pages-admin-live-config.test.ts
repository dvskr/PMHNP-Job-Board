/**
 * /admin/settings and /admin/cron used to report things they never read.
 *
 * Settings was a client component with no data access: every "Active" pill was
 * a literal, and two of the env names it displayed (FB_PAGE_ACCESS_TOKEN,
 * IG_USER_ID) are read nowhere in the codebase. /admin/cron called itself a
 * Health Dashboard while fetching only the vercel.json schedule list, so a
 * cron that had been failing for a week looked exactly like a healthy one.
 *
 * The invariants worth keeping: a settings row may only claim a status it can
 * derive from env keys the runtime actually reads, and the cron page must be
 * able to find a cron's run history from its scheduled path.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    INTEGRATION_SECTIONS,
    readIntegrationStatus,
    type IntegrationRow,
} from '@/app/admin/settings/config-status';
import { cronNameFromPath, isRunStale, STALE_RUN_MS } from '@/app/admin/cron/cron-run-lookup';

const ALL_ROWS: IntegrationRow[] = INTEGRATION_SECTIONS.flatMap((s) => [...s.rows]);

function readSources(relPath: string): string {
    const abs = path.join(process.cwd(), relPath);
    const stat = fs.statSync(abs);
    if (stat.isFile()) return fs.readFileSync(abs, 'utf8');
    return fs
        .readdirSync(abs, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => fs.readFileSync(path.join(entry.parentPath ?? abs, entry.name), 'utf8'))
        .join('\n');
}

describe('admin settings config status', () => {
    it('derives every row from env, never from a literal', () => {
        expect(ALL_ROWS.length).toBeGreaterThan(0);
        for (const row of ALL_ROWS) {
            expect(row.envKeys.length).toBeGreaterThan(0);
        }
    });

    it('reports not-configured when the keys are absent', () => {
        for (const row of ALL_ROWS) {
            const status = readIntegrationStatus(row, {});
            expect(status.configured).toBe(false);
            expect(status.missing).toEqual([...row.envKeys]);
        }
    });

    it('reports configured only when every key it names is present', () => {
        for (const row of ALL_ROWS) {
            const full = Object.fromEntries(row.envKeys.map((k) => [k, 'set']));
            expect(readIntegrationStatus(row, full).configured).toBe(true);

            if (row.envKeys.length > 1) {
                const partial = { ...full };
                delete partial[row.envKeys[0]];
                const status = readIntegrationStatus(row, partial);
                expect(status.configured).toBe(false);
                expect(status.missing).toContain(row.envKeys[0]);
            }
        }
    });

    it('counts a blank value as missing', () => {
        const row = ALL_ROWS[0];
        const blank = Object.fromEntries(row.envKeys.map((k) => [k, '   ']));
        expect(readIntegrationStatus(row, blank).configured).toBe(false);
    });

    it('names env keys the runtime really reads, at the place it says it reads them', () => {
        // This is the defect that made the old page worse than useless: it
        // displayed FB_PAGE_ACCESS_TOKEN and IG_USER_ID, neither of which any
        // code path looks at. Both social crons read POSTIZ_* instead.
        for (const row of ALL_ROWS) {
            const source = readSources(row.readBy);
            for (const key of row.envKeys) {
                expect(
                    source.includes(key),
                    `${row.label} claims ${key} is read by ${row.readBy}`,
                ).toBe(true);
            }
        }
    });
});

describe('cron run lookup', () => {
    it('maps a scheduled path to the name withCronTracking records under', () => {
        expect(cronNameFromPath('/api/cron/index-pseo')).toBe('index-pseo');
        expect(cronNameFromPath('/api/cron/ingest?source=adzuna&chunk=1')).toBe('ingest');
        expect(cronNameFromPath('/api/cron/send-alerts?frequency=daily')).toBe('send-alerts');
    });

    it('agrees with the names the cron routes actually pass to withCronTracking', () => {
        // The join is only useful if it lands on real rows. Sample the routes
        // and confirm the path a scheduler would call resolves to the tracked
        // name, rather than trusting the convention holds.
        const cronDir = path.join(process.cwd(), 'app/api/cron');
        const routes = fs
            .readdirSync(cronDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory());

        let checked = 0;
        for (const route of routes) {
            const file = path.join(cronDir, route.name, 'route.ts');
            if (!fs.existsSync(file)) continue;
            const tracked = fs.readFileSync(file, 'utf8').match(/withCronTracking\(\s*'([^']+)'/);
            if (!tracked) continue;
            checked += 1;
            expect(
                cronNameFromPath(`/api/cron/${route.name}?source=x`),
                `${route.name} route`,
            ).toBe(tracked[1]);
        }
        expect(checked).toBeGreaterThan(10);
    });

    it('flags a run older than a week and leaves a recent one alone', () => {
        const now = Date.now();
        expect(isRunStale(new Date(now - STALE_RUN_MS - 1000).toISOString(), now)).toBe(true);
        expect(isRunStale(new Date(now - 60_000).toISOString(), now)).toBe(false);
    });

    it('does not call an unparseable timestamp stale', () => {
        expect(isRunStale('not a date')).toBe(false);
    });
});
