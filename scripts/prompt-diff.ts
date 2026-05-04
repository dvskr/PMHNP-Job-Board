#!/usr/bin/env node
/**
 * Prompt diff CLI — `npm run prompt:diff <task>` shows a line-level diff
 * between the two newest registered versions, and the eval delta if the
 * harness has a suite for that task.
 *
 * Usage:
 *   npm run prompt:diff candidate_scoring
 *   npm run prompt:diff candidate_scoring v1 v2
 */

import { listPrompts, loadPrompt } from '@/lib/ai/prompts/registry';
import type { AiTaskId } from '@/lib/ai/types';

function unifiedDiff(a: string, b: string, labelA: string, labelB: string): string {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    const max = Math.max(aLines.length, bLines.length);
    const out: string[] = [`--- ${labelA}`, `+++ ${labelB}`];
    for (let i = 0; i < max; i++) {
        const al = aLines[i];
        const bl = bLines[i];
        if (al === bl) continue;
        if (al !== undefined) out.push(`- ${al}`);
        if (bl !== undefined) out.push(`+ ${bl}`);
    }
    return out.join('\n');
}

async function main(): Promise<void> {
    const [, , task, fromArg, toArg] = process.argv;
    if (!task) {
        const all = await listPrompts();
        console.log('Usage: npm run prompt:diff <task> [fromVersion] [toVersion]\n');
        console.log('Registered prompts:');
        for (const entry of all) {
            console.log(`  ${entry.task}: ${entry.versions.join(', ')}`);
        }
        process.exit(2);
    }

    const all = await listPrompts();
    const taskEntry = all.find((e) => e.task === task);
    if (!taskEntry) {
        console.error(`No prompt versions registered for task "${task}".`);
        process.exit(2);
    }
    const versions = [...taskEntry.versions];
    if (versions.length < 2 && (!fromArg || !toArg)) {
        console.log(`Only one version registered for ${task}: ${versions.join(', ')}`);
        return;
    }
    const from = fromArg ?? versions[versions.length - 2];
    const to   = toArg   ?? versions[versions.length - 1];

    const a = await loadPrompt(task as AiTaskId, from);
    const b = await loadPrompt(task as AiTaskId, to);

    console.log(`\n=== System prompt diff (${task} ${from} → ${to}) ===`);
    console.log(unifiedDiff(a.rawSystem, b.rawSystem, `${task}/${from}/system`, `${task}/${to}/system`));

    console.log(`\n=== User template diff (${task} ${from} → ${to}) ===`);
    console.log(unifiedDiff(a.rawUserTemplate, b.rawUserTemplate, `${task}/${from}/user`, `${task}/${to}/user`));
}

main().catch((err) => {
    console.error('[prompt:diff] error', err);
    process.exit(1);
});
