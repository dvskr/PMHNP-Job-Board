#!/usr/bin/env node
/**
 * Eval CLI — invoked via `npm run eval <task> [--bias] [--fail-fast]`.
 *
 * Examples:
 *   npm run eval candidate_scoring          # run golden set
 *   npm run eval candidate_scoring --bias   # run bias pair set instead
 *   npm run eval all                        # run every registered suite
 *
 * Exits non-zero if the suite fails to hold its baseline. CI gates merge on
 * exit code (Sprint 0.5 wires the GitHub Actions step).
 *
 * Live mode hits the configured LLM provider — costs real money. Use the
 * EVAL_DRY_RUN=1 env var to print the planned suite shape without making any
 * provider calls (useful in CI to validate the harness wiring).
 */

import { getEvalEntry, listEvalTasks } from '@/lib/ai/eval';
import type { AiTaskId } from '@/lib/ai/types';

interface CliArgs {
    tasks: string[] | 'all';
    bias: boolean;
    failFast: boolean;
    dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
    const args = argv.slice(2);
    const flagSet = new Set(args.filter((a) => a.startsWith('--')));
    const positional = args.filter((a) => !a.startsWith('--'));
    const bias = flagSet.has('--bias');
    const failFast = flagSet.has('--fail-fast');
    const dryRun = process.env.EVAL_DRY_RUN === '1' || flagSet.has('--dry-run');

    if (positional.length === 0) {
        printUsage();
        process.exit(2);
    }
    if (positional[0] === 'all') {
        return { tasks: 'all', bias, failFast, dryRun };
    }
    const tasks = positional;
    for (const t of tasks) {
        if (!getEvalEntry(t)) {
            console.error(`Unknown eval task "${t}". Registered: ${listEvalTasks().join(', ') || '(none)'}`);
            process.exit(2);
        }
    }
    return { tasks, bias, failFast, dryRun };
}

function printUsage(): void {
    console.log(`Usage: npm run eval <task...|all> [--bias] [--fail-fast] [--dry-run]
Registered tasks: ${listEvalTasks().join(', ') || '(none)'}

Modes:
  (default)   Run the golden set for each task. Threshold per suite contract.
  --bias      Run the bias pair set. Variance >2pt fails the suite.
  --dry-run   Validate the harness wiring without making provider calls.
              EVAL_DRY_RUN=1 also works.

Exits 0 if every suite holds baseline; 1 otherwise.`);
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv);
    const tasksToRun: string[] = args.tasks === 'all' ? listEvalTasks() : args.tasks;

    if (args.dryRun) {
        console.log('[eval] DRY RUN — listing planned suites without provider calls.');
        for (const task of tasksToRun) {
            console.log(`  • ${task} ${args.bias ? '(bias)' : '(golden|ranking)'}`);
        }
        return;
    }

    let allHeld = true;
    for (const task of tasksToRun) {
        const entry = getEvalEntry(task);
        if (!entry) continue;

        if (args.bias) {
            if (!entry.runBias) {
                console.log(`\n[eval] ${task} — no bias suite registered, skipping`);
                continue;
            }
            console.log(`\n[eval] ${task} — BIAS PAIR SET`);
            const result = await entry.runBias();
            console.log(`  ${result.summary}`);
            console.log(`  totalPairs=${result.totalPairs} maxVariance=${result.maxVariance.toFixed(2)} meanVariance=${result.meanVariance.toFixed(2)}`);
            for (const p of result.pairs.filter((p) => !p.passed)) {
                console.log(`    ✗ ${p.pairId}: ${p.reason}`);
            }
            if (!result.holdsBaseline) allHeld = false;
        } else if (entry.runRanking) {
            console.log(`\n[eval] ${task} — RANKING SUITE`);
            const result = await entry.runRanking();
            console.log(`  ${result.summary}`);
            for (const c of result.perCase.filter((p) => !p.passed)) {
                console.log(`    ✗ ${c.id}: ${c.reason}`);
            }
            if (!result.holdsBaseline) allHeld = false;
        } else if (entry.runGolden) {
            console.log(`\n[eval] ${task} — GOLDEN SET`);
            const result = await entry.runGolden({ failFast: args.failFast });
            console.log(`  ${result.summary}`);
            console.log(`  cost=$${result.totalCostUsd.toFixed(4)} p95=${result.p95LatencyMs}ms`);
            for (const c of result.cases.filter((c) => !c.passed)) {
                console.log(`    ✗ ${c.caseId}: ${c.reason}`);
            }
            if (!result.holdsBaseline) allHeld = false;
        } else {
            console.log(`\n[eval] ${task} — no runners registered, skipping`);
        }
    }
    process.exit(allHeld ? 0 : 1);
}

main().catch((err) => {
    console.error('[eval] fatal error', err);
    process.exit(1);
});
