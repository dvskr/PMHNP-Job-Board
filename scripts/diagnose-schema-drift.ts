/**
 * Compare every model in prisma/schema.prisma against the actual prod
 * database. Reports any column the schema declares but the DB doesn't have.
 *
 * This catches the same class of bug as saved_candidates.tags (schema
 * field added without a migration → P2022 errors at runtime).
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import * as fs from 'fs';

interface ModelField {
    field: string;       // Prisma field name (camelCase)
    column: string;      // DB column name (snake_case via @map or default)
    optional: boolean;
}
interface ModelInfo {
    name: string;
    table: string;       // @@map name or default lowercase
    fields: ModelField[];
}

function parseSchema(path: string): ModelInfo[] {
    const text = fs.readFileSync(path, 'utf8');
    const models: ModelInfo[] = [];

    const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
    let m: RegExpExecArray | null;
    while ((m = modelRe.exec(text)) !== null) {
        const modelName = m[1];
        const body = m[2];

        // Find @@map for table name. Without @@map Prisma preserves the
        // model name as the table name verbatim (case-sensitive). Quoting
        // is required at SQL time but information_schema.tables stores
        // the case-preserved name as-is.
        const mapMatch = body.match(/@@map\("([^"]+)"\)/);
        const table = mapMatch ? mapMatch[1] : modelName;

        const fields: ModelField[] = [];
        for (const line of body.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
            // Match: <fieldName>  <type>[?]  ...modifiers
            const fm = /^(\w+)\s+([^\s?]+)(\??)\s*(.*)$/.exec(trimmed);
            if (!fm) continue;
            const fieldName = fm[1];
            const optional = fm[3] === '?';
            const rest = fm[4];

            // Skip relation-only fields (no @map, type starts uppercase, no scalar
            // default). We detect by whether the line has @relation or the type
            // starts with a capital and is NOT a known scalar.
            const SCALARS = new Set([
                'String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean',
                'DateTime', 'Json', 'Bytes',
            ]);
            // Pull the type WITHOUT trailing `[]?`
            const baseType = fm[2].replace(/\[\]/g, '');
            const isScalar = SCALARS.has(baseType);
            const isEnum = baseType[0] === baseType[0].toUpperCase() && !isScalar;
            if (!isScalar && /\@relation/.test(rest)) continue;
            if (isEnum && !/\@map\(/.test(rest)) continue;

            // Ignore declarations like `screeningQuestions JobScreeningQuestion[]` (relations)
            if (!isScalar && !/\@map/.test(rest) && /\[\]/.test(fm[2])) continue;

            // Resolve DB column name
            const mapField = rest.match(/@map\("([^"]+)"\)/);
            const column = mapField ? mapField[1] : fieldName;

            fields.push({ field: fieldName, column, optional });
        }
        models.push({ name: modelName, table, fields });
    }
    return models;
}

async function main(): Promise<void> {
    const models = parseSchema('prisma/schema.prisma');
    console.log(`Parsed ${models.length} models from schema.prisma\n`);

    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    const dbTables = new Set(tables.map((t) => t.table_name));

    const drift: { model: string; table: string; missingColumns: string[]; tableMissing?: boolean }[] = [];

    for (const model of models) {
        if (!dbTables.has(model.table)) {
            drift.push({ model: model.name, table: model.table, missingColumns: [], tableMissing: true });
            continue;
        }

        const cols = await prisma.$queryRaw<{ column_name: string }[]>`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ${model.table}
        `;
        const dbCols = new Set(cols.map((c) => c.column_name));

        const missing = model.fields
            .filter((f) => !dbCols.has(f.column))
            .map((f) => `${f.column} (${f.field}${f.optional ? '?' : ''})`);

        if (missing.length > 0) {
            drift.push({ model: model.name, table: model.table, missingColumns: missing });
        }
    }

    console.log('═'.repeat(70));
    if (drift.length === 0) {
        console.log('✓ No schema drift. Every model column exists in prod DB.');
    } else {
        console.log(`Found drift in ${drift.length} models:\n`);
        for (const d of drift) {
            if (d.tableMissing) {
                console.log(`✗ ${d.model} → table "${d.table}" DOES NOT EXIST`);
            } else {
                console.log(`✗ ${d.model} → table "${d.table}" missing ${d.missingColumns.length} column(s):`);
                for (const c of d.missingColumns) console.log(`     - ${c}`);
            }
            console.log();
        }
    }
    console.log('═'.repeat(70));

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Diagnose failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
