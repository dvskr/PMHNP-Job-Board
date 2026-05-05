/**
 * Adapter registry — single source of truth mapping JobSource to its
 * Aggregator implementation. The orchestrator's fetchFromSource() reads
 * from here instead of a hardcoded switch.
 *
 * Adding a new source:
 *   1. Implement the Aggregator interface in lib/aggregators/<source>.ts
 *      and export `<source>Aggregator: Aggregator`.
 *   2. Add the source key to `JobSource` in lib/aggregators/types.ts.
 *   3. Register the export below.
 *   4. Add cron entries to vercel.json (count must equal the
 *      adapter's `chunkCount` — see tests/aggregators/chunk-count.test.ts).
 */

import type { Aggregator, JobSource } from './types';

import { adzunaAggregator } from './adzuna';
import { greenhouseAggregator } from './greenhouse';
import { leverAggregator } from './lever';
import { workdayAggregator } from './workday';
import { fantasticJobsDbAggregator } from './fantastic-jobs-db';
import { smartRecruitersAggregator } from './smartrecruiters';

export const aggregators: Record<JobSource, Aggregator> = {
    adzuna: adzunaAggregator,
    greenhouse: greenhouseAggregator,
    lever: leverAggregator,
    workday: workdayAggregator,
    'fantastic-jobs-db': fantasticJobsDbAggregator,
    smartrecruiters: smartRecruitersAggregator,
};
