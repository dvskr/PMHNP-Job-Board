/**
 * One-off: enable shipped AI feature flags globally in PROD.
 *
 *   STEP=diagnose npm run flag-on   → reads + reports current state
 *   STEP=execute  npm run flag-on   → upserts global=true overrides
 *
 * Flags enabled (4 user-facing features that have shipped routes + UI):
 *   - ai.search.semantic              → AI Search bar on /jobs
 *   - ai.candidate.recommendations    → "For You" feed on candidate dashboard
 *   - ai.candidate.recommendations_email → weekly digest cron (per-user
 *     toggle in /settings still works — sets enabled=false override
 *     for users who unsubscribe; the toggle's GET returns the effective
 *     state per the 2026-05-04 fix in app/api/user/email-preferences/
 *     ai-digest/route.ts)
 *   - ai.employer.talent_search       → Smart Match + JD match on /employer/candidates
 *
 * Flags NOT touched (skipped on purpose):
 *   - ai.search.match_badge — UI doesn't render this badge anywhere yet
 *   - ai.candidate.application_coach, ai.candidate.cover_letter — Phase 2
 *   - ai.employer.jd_generator, .bias_audit, .outreach_composer,
 *     .candidate_compare, .interview_prep — Phase 3
 *   - ai.platform.spam_detection, .support_bot, .seo_content — Phase 4
 *
 * Delete this file after both phases complete.
 */
import { config } from 'dotenv';
import { Client as PgClient } from 'pg';
import { randomBytes } from 'crypto';
config({ path: '.env.prod' });

const FLAGS_TO_ENABLE = [
    'ai.search.semantic',
    'ai.candidate.recommendations',
    'ai.candidate.recommendations_email',
    'ai.employer.talent_search',
] as const;

function env(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

function generateId(): string {
    return 'c' + randomBytes(12).toString('hex');
}

async function main(): Promise<void> {
    const step = process.env.STEP ?? 'diagnose';
    const pg = new PgClient({ connectionString: env('PROD_DIRECT_DATABASE_URL') });
    await pg.connect();

    try {
        // ── Diagnose: existing global overrides for these flags ───────
        console.log('\n══════════════════════════════════════════════');
        console.log('CURRENT STATE — global overrides for shipped flags');
        console.log('══════════════════════════════════════════════\n');
        for (const flag of FLAGS_TO_ENABLE) {
            const { rows } = await pg.query<{ id: string; enabled: boolean; reason: string | null }>(
                `SELECT id, enabled, reason
                   FROM ai_feature_flag_override
                  WHERE flag = $1 AND tenant_type = 'global'`,
                [flag],
            );
            if (rows.length === 0) {
                console.log(`  ${flag.padEnd(40)} → no global override (compiled default applies)`);
            } else {
                const r = rows[0];
                console.log(`  ${flag.padEnd(40)} → enabled=${r.enabled} (id=${r.id.slice(0, 8)}…, reason="${r.reason ?? ''}")`);
            }
        }

        // Per-user override counts (informational — only matters for recommendations_email)
        const { rows: userRows } = await pg.query<{ flag: string; enabled: boolean; count: string }>(
            `SELECT flag, enabled, COUNT(*)::text AS count
               FROM ai_feature_flag_override
              WHERE tenant_type = 'candidate'
                AND flag = ANY($1::text[])
              GROUP BY flag, enabled
              ORDER BY flag, enabled`,
            [FLAGS_TO_ENABLE as unknown as string[]],
        );
        if (userRows.length > 0) {
            console.log('\nExisting per-user overrides (will be respected — they take priority over global):');
            for (const r of userRows) {
                console.log(`  ${r.flag.padEnd(40)} enabled=${r.enabled} → ${r.count} candidate(s)`);
            }
        }
        console.log('');

        if (step !== 'execute') {
            console.log('STEP=diagnose — read-only mode. Re-run with STEP=execute to upsert global=true rows.');
            return;
        }

        // ── Execute: upsert global=true for each flag ────────────────
        console.log('══════════════════════════════════════════════');
        console.log('ENABLING FLAGS GLOBALLY');
        console.log('══════════════════════════════════════════════\n');
        for (const flag of FLAGS_TO_ENABLE) {
            const { rows: existing } = await pg.query<{ id: string; enabled: boolean }>(
                `SELECT id, enabled FROM ai_feature_flag_override
                  WHERE flag = $1 AND tenant_type = 'global'`,
                [flag],
            );
            if (existing.length > 0) {
                await pg.query(
                    `UPDATE ai_feature_flag_override
                        SET enabled = true,
                            reason = 'Phase 1 GA — global on (2026-05-04)',
                            updated_at = NOW()
                      WHERE id = $1`,
                    [existing[0].id],
                );
                console.log(`  ✓ Updated: ${flag} (was enabled=${existing[0].enabled})`);
            } else {
                const id = generateId();
                await pg.query(
                    `INSERT INTO ai_feature_flag_override
                        (id, flag, tenant_type, tenant_id, enabled, reason, set_by, expires_at, created_at, updated_at)
                     VALUES ($1, $2, 'global', NULL, true, 'Phase 1 GA — global on (2026-05-04)', NULL, NULL, NOW(), NOW())`,
                    [id, flag],
                );
                console.log(`  ✓ Inserted: ${flag} (id=${id.slice(0, 8)}…)`);
            }
        }
        console.log('\n══════════════════════════════════════════════');
        console.log('Verification — enabled state for each flag:');
        for (const flag of FLAGS_TO_ENABLE) {
            const { rows } = await pg.query<{ enabled: boolean }>(
                `SELECT enabled FROM ai_feature_flag_override
                  WHERE flag = $1 AND tenant_type = 'global'`,
                [flag],
            );
            const ok = rows.length === 1 && rows[0].enabled;
            console.log(`  ${ok ? '✓' : '✗'} ${flag.padEnd(40)} enabled=${rows[0]?.enabled}`);
        }
        console.log('\nFlags will activate across all instances within the 60-second flag cache TTL.');
    } finally {
        await pg.end();
    }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
