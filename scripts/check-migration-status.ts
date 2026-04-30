// One-off check: which of the four compliance migrations actually
// applied to prod, by inspecting the schema directly.
import { prisma } from '@/lib/prisma';

async function tableExists(name: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        name,
    );
    return rows[0].count > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        table,
        column,
    );
    return rows[0].count > 0;
}

async function main() {
    const checks: Record<string, boolean> = {
        'data_requests table (add_data_request)': await tableExists('data_requests'),

        'audit_logs table (add_lifecycle_and_audit)': await tableExists('audit_logs'),
        'user_profiles.deleted_at (add_lifecycle_and_audit)': await columnExists('user_profiles', 'deleted_at'),
        'user_profiles.purge_at (add_lifecycle_and_audit)': await columnExists('user_profiles', 'purge_at'),
        'user_profiles.last_seen_at (add_lifecycle_and_audit)': await columnExists('user_profiles', 'last_seen_at'),
        'user_profiles.purge_warning_email_sent_at (add_lifecycle_and_audit)': await columnExists('user_profiles', 'purge_warning_email_sent_at'),

        'job_alerts.confirmed_at (add_job_alert_double_optin)': await columnExists('job_alerts', 'confirmed_at'),
        'job_alerts.confirmation_token (add_job_alert_double_optin)': await columnExists('job_alerts', 'confirmation_token'),

        'user_profiles.sensitive_data_consent (add_sensitive_data_consent)': await columnExists('user_profiles', 'sensitive_data_consent'),
        'user_profiles.sensitive_data_consent_at (add_sensitive_data_consent)': await columnExists('user_profiles', 'sensitive_data_consent_at'),
    };

    console.log('--- Migration application status ---');
    for (const [k, v] of Object.entries(checks)) {
        console.log(`${v ? '✓' : '✗'} ${k}`);
    }

    const tracked = await prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
        `SELECT migration_name, finished_at, rolled_back_at
         FROM _prisma_migrations
         WHERE migration_name LIKE '20260430_add_%'
         ORDER BY migration_name`,
    );
    console.log('\n--- _prisma_migrations rows for our 4 ---');
    for (const r of tracked) {
        console.log(`${r.finished_at ? '✓' : '✗'} ${r.migration_name}  finished=${r.finished_at?.toISOString() ?? '-'}  rolled_back=${r.rolled_back_at?.toISOString() ?? '-'}`);
    }

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
