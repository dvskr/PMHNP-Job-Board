/**
 * Regression (audit H11) — 18 models in schema.prisma had no CREATE TABLE in any
 * migration (they were created on prod via `db push`), so `prisma migrate deploy`
 * could not build a fresh database. This test fails the moment a schema model
 * lacks a corresponding CREATE TABLE somewhere in prisma/migrations.
 *
 * Extended (audit follow-up, 2026-07) — table-level coverage was not enough:
 * dozens of COLUMNS (e.g. jobs.clinical_setting, jobs.quality_score,
 * employer_jobs.pricing_tier, job_applications.status) existed on prod only
 * via `db push` and were missing from every migration, so a fresh
 * `prisma migrate deploy` database crashed the Prisma client on first SELECT.
 * The column-level test below fails the moment a schema column (by its
 * DATABASE name, i.e. the @map value) has no CREATE TABLE column definition
 * or ALTER TABLE ... ADD COLUMN in any migration for that model's table.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');

/** Tables a Prisma model maps to: the @@map value, else the model name. */
function schemaTableNames(): string[] {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const tables: string[] = [];
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src)) !== null) {
    const [, modelName, body] = m;
    const mapMatch = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    tables.push(mapMatch ? mapMatch[1] : modelName);
  }
  return tables;
}

interface ModelColumns {
  model: string;
  table: string;
  /** Database column names (the @map value, else the field name). */
  columns: string[];
}

/**
 * Parse every model into its table name + scalar column names (database
 * names, respecting field-level @map). Relation fields (whose type is
 * another model) don't materialize as columns and are skipped; scalar
 * lists, enums-by-name and Unsupported(...) fields are real columns.
 */
function schemaModelColumns(): ModelColumns[] {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

  // First pass: collect model names so relation fields can be recognized.
  const modelNames = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src)) !== null) modelNames.add(m[1]);

  const out: ModelColumns[] = [];
  modelRe.lastIndex = 0;
  while ((m = modelRe.exec(src)) !== null) {
    const [, modelName, body] = m;
    const mapMatch = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    const table = mapMatch ? mapMatch[1] : modelName;
    const columns: string[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      // fieldName Type[]? @attributes — Unsupported("...") is a valid type token.
      const field = line.match(/^(\w+)\s+(Unsupported\("[^"]*"\)|\w+)(\[\])?(\?)?(\s|$)/);
      if (!field) continue;
      const [, fieldName, baseType] = field;
      if (modelNames.has(baseType)) continue; // relation field, no column
      const fieldMap = line.match(/@map\(\s*"([^"]+)"\s*\)/);
      columns.push(fieldMap ? fieldMap[1] : fieldName);
    }
    out.push({ model: modelName, table, columns });
  }
  return out;
}

/** Read a .sql file regardless of encoding (Prisma expects UTF-8, but guard
 *  against a stray UTF-16 file so the coverage check isn't silently fooled). */
function readSql(file: string): string {
  const buf = fs.readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8');
  return buf.toString('utf8');
}

function sqlFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.sql')) files.push(full);
    }
  };
  walk(MIGRATIONS_DIR);
  return files;
}

function migrationCreatedTables(): Set<string> {
  const created = new Set<string>();
  for (const full of sqlFiles()) {
    const sql = readSql(full);
    // Handle both the bare `"table"` form and the schema-qualified
    // `"public"."table"` form used by the 0_init migration.
    const re = /CREATE TABLE (?:IF NOT EXISTS )?(?:"public"\.)?"([A-Za-z0-9_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) created.add(m[1]);
  }
  return created;
}

/**
 * Cumulative column coverage per table across every migration:
 *   - column definitions inside CREATE TABLE "t" ( ... ) bodies
 *   - ALTER TABLE "t" ADD COLUMN [IF NOT EXISTS] "c" (quoted or bare,
 *     including multi-ADD statements)
 * Coverage is a union — a column mentioned anywhere counts. RENAME/DROP are
 * deliberately ignored: this is a "was it ever migrated at all" check, not a
 * replay of history (job_health_checks is renamed to _legacy and re-created
 * with the same columns, which the union handles correctly).
 */
function migrationTableColumns(): Map<string, Set<string>> {
  const byTable = new Map<string, Set<string>>();
  const add = (table: string, column: string) => {
    let set = byTable.get(table);
    if (!set) {
      set = new Set<string>();
      byTable.set(table, set);
    }
    set.add(column);
  };

  for (const full of sqlFiles()) {
    const sql = readSql(full);

    // CREATE TABLE bodies. `\n)` terminates the column list in every
    // migration in this repo (inline parens like TIMESTAMP(3) never sit at
    // the start of a line). PARTITION OF child tables have no column list
    // and are skipped by construction.
    const createRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"public"\.)?"?([A-Za-z0-9_]+)"?\s*\(([\s\S]*?)\n\)/g;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql)) !== null) {
      const [, table, tableBody] = m;
      for (const rawLine of tableBody.split('\n')) {
        const col = rawLine.match(/^\s*"([A-Za-z0-9_]+)"\s/);
        if (col) add(table, col[1]);
      }
    }

    // ALTER TABLE ... ADD COLUMN ... (possibly several per statement,
    // possibly unquoted identifiers).
    const alterRe = /ALTER TABLE\s+(?:ONLY\s+)?(?:"public"\.)?"?([A-Za-z0-9_]+)"?([\s\S]*?);/g;
    while ((m = alterRe.exec(sql)) !== null) {
      const [, table, alterBody] = m;
      const addColRe = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([A-Za-z0-9_]+)"?/g;
      let c: RegExpExecArray | null;
      while ((c = addColRe.exec(alterBody)) !== null) add(table, c[1]);
    }
  }
  return byTable;
}

describe('prisma migrations cover the schema', () => {
  it('every model in schema.prisma has a CREATE TABLE in some migration', () => {
    const schemaTables = schemaTableNames();
    const migrated = migrationCreatedTables();
    const missing = schemaTables.filter((t) => !migrated.has(t));
    expect(missing, `Tables in schema.prisma with no migration CREATE TABLE: ${missing.join(', ')}`).toEqual([]);
  });

  it('every column in schema.prisma has a CREATE TABLE definition or ADD COLUMN in some migration', () => {
    const migrated = migrationTableColumns();
    const missing: string[] = [];
    for (const { model, table, columns } of schemaModelColumns()) {
      const migratedColumns = migrated.get(table) ?? new Set<string>();
      for (const column of columns) {
        if (!migratedColumns.has(column)) missing.push(`${table}.${column} (model ${model})`);
      }
    }
    expect(
      missing,
      `Columns in schema.prisma with no migration coverage (created on prod via db push only):\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });

  it('schema parser sanity: relation fields are not mistaken for columns', () => {
    // Guard against parser drift silently weakening the coverage test:
    // Job.company is a relation (no column), while Job.companyId maps to
    // the real company_id column; Job.setting maps to clinical_setting.
    const job = schemaModelColumns().find((m) => m.model === 'Job');
    expect(job?.table).toBe('jobs');
    expect(job?.columns).not.toContain('company');
    expect(job?.columns).toContain('company_id');
    expect(job?.columns).toContain('clinical_setting');
  });

  it('no migration file is UTF-16 encoded (Prisma reads SQL as UTF-8; a fresh migrate deploy would choke)', () => {
    const utf16: string[] = [];
    for (const f of sqlFiles()) {
      const head = fs.readFileSync(f).subarray(0, 2);
      if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
        utf16.push(path.relative(ROOT, f));
      }
    }
    expect(utf16, `UTF-16 migration files: ${utf16.join(', ')}`).toEqual([]);
  });
});
