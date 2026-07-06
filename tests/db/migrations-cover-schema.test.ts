/**
 * Regression (audit H11) — 18 models in schema.prisma had no CREATE TABLE in any
 * migration (they were created on prod via `db push`), so `prisma migrate deploy`
 * could not build a fresh database. This test fails the moment a schema model
 * lacks a corresponding CREATE TABLE somewhere in prisma/migrations.
 *
 * Extended (2026-07-03) to COLUMN level: the table-only check is exactly how
 * 41 drifted columns (jobs.quality_score, employer_jobs.pricing_tier, the
 * job_applications tracking columns, ...) shipped green while fresh deploys
 * crashed with P2022. Every column a model declares must be created by some
 * migration (CREATE TABLE body, ALTER TABLE ADD COLUMN, or RENAME COLUMN).
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

/** Columns each model expects: @map value when present, else the field name.
 *  Relation fields (type is another model) carry no column and are skipped. */
function schemaExpectedColumns(): Map<string, Set<string>> {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const modelNames = new Set<string>();
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src)) !== null) modelNames.add(m[1]);

  const expected = new Map<string, Set<string>>();
  modelRe.lastIndex = 0;
  while ((m = modelRe.exec(src)) !== null) {
    const [, modelName, body] = m;
    const mapMatch = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    const table = mapMatch ? mapMatch[1] : modelName;
    const columns = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const field = line.match(/^(\w+)\s+(\S+)/);
      if (!field) continue;
      const [, fieldName, rawType] = field;
      const baseType = rawType.replace(/[[\]?!]+$/, '');
      // Relation fields (Job, EmployerJob?, Job[]) have no DB column.
      if (modelNames.has(baseType)) continue;
      const fieldMap = line.match(/@map\(\s*"([^"]+)"\s*\)/);
      columns.add(fieldMap ? fieldMap[1] : fieldName);
    }
    expected.set(table, columns);
  }
  return expected;
}

/** Net schema objects across all migrations: columns created per table
 *  (CREATE TABLE bodies, ALTER TABLE ... ADD COLUMN incl. comma-chained
 *  clauses, RENAME COLUMN targets), columns dropped per table (DROP COLUMN,
 *  RENAME COLUMN sources), and dropped tables. */
function migrationSchemaObjects(): {
  created: Map<string, Set<string>>;
  droppedColumns: Map<string, Set<string>>;
  droppedTables: Set<string>;
} {
  const created = new Map<string, Set<string>>();
  const droppedColumns = new Map<string, Set<string>>();
  const droppedTables = new Set<string>();
  const addTo = (map: Map<string, Set<string>>, table: string, column: string) => {
    if (!map.has(table)) map.set(table, new Set());
    map.get(table)!.add(column);
  };

  for (const full of sqlFiles()) {
    const sql = readSql(full);

    const createRe = /CREATE TABLE (?:IF NOT EXISTS )?(?:"public"\.)?"([A-Za-z0-9_]+)"\s*\(([\s\S]*?)\n\)/g;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql)) !== null) {
      const [, table, body] = m;
      for (const rawLine of body.split('\n')) {
        const col = rawLine.match(/^\s*"([A-Za-z0-9_]+)"/);
        if (col) addTo(created, table, col[1]);
      }
    }

    const alterRe = /ALTER TABLE\s+(?:ONLY\s+)?(?:"public"\.)?"?([A-Za-z0-9_]+)"?\s+([\s\S]*?);/g;
    while ((m = alterRe.exec(sql)) !== null) {
      const [, table, clauses] = m;
      const addColRe = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([A-Za-z0-9_]+)"?/g;
      let c: RegExpExecArray | null;
      while ((c = addColRe.exec(clauses)) !== null) addTo(created, table, c[1]);
      const renameRe = /RENAME COLUMN\s+"?([A-Za-z0-9_]+)"?\s+TO\s+"?([A-Za-z0-9_]+)"?/g;
      while ((c = renameRe.exec(clauses)) !== null) {
        addTo(created, table, c[2]);
        addTo(droppedColumns, table, c[1]);
      }
      const dropColRe = /DROP COLUMN\s+(?:IF EXISTS\s+)?"?([A-Za-z0-9_]+)"?/g;
      while ((c = dropColRe.exec(clauses)) !== null) addTo(droppedColumns, table, c[1]);
    }

    const dropTableRe = /DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"?([A-Za-z0-9_]+)"?/g;
    while ((m = dropTableRe.exec(sql)) !== null) droppedTables.add(m[1]);
  }
  return { created, droppedColumns, droppedTables };
}

function migrationCreatedColumns(): Map<string, Set<string>> {
  return migrationSchemaObjects().created;
}

describe('prisma migrations cover the schema', () => {
  it('every model in schema.prisma has a CREATE TABLE in some migration', () => {
    const schemaTables = schemaTableNames();
    const migrated = migrationCreatedTables();
    const missing = schemaTables.filter((t) => !migrated.has(t));
    expect(missing, `Tables in schema.prisma with no migration CREATE TABLE: ${missing.join(', ')}`).toEqual([]);
  });

  it('every column in schema.prisma is created by some migration', () => {
    const expected = schemaExpectedColumns();
    const created = migrationCreatedColumns();
    const missing: string[] = [];
    for (const [table, columns] of expected) {
      const have = created.get(table) ?? new Set<string>();
      for (const column of columns) {
        if (!have.has(column)) missing.push(`${table}.${column}`);
      }
    }
    expect(
      missing,
      `Columns in schema.prisma no migration creates (fresh deploys P2022 on these): ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('no migration drops a column the schema still declares', () => {
    // The column-coverage test above checks GROSS created columns, so a
    // future migration dropping a schema-declared column would pass it while
    // fresh deploys P2022. Guard the drop direction explicitly. If a column
    // is ever legitimately dropped and re-added (net no-op), extend this to
    // order-aware net-state tracking instead of deleting the assertion.
    const expected = schemaExpectedColumns();
    const { droppedColumns, droppedTables } = migrationSchemaObjects();
    const offenders: string[] = [];
    for (const [table, dropped] of droppedColumns) {
      if (droppedTables.has(table) || !expected.has(table)) continue;
      for (const column of dropped) {
        if (expected.get(table)!.has(column)) offenders.push(`${table}.${column}`);
      }
    }
    expect(
      offenders,
      `Migrations DROP columns schema.prisma still declares (fresh deploys P2022): ${offenders.join(', ')}`
    ).toEqual([]);
  });

  it('migrations create nothing the schema does not declare (reverse drift)', () => {
    // Regression (audit #20) — 0_init created 26 columns + candidate_documents
    // that schema.prisma never declared (and prod no longer carries); any
    // future `migrate dev` would then generate destructive DROPs. Net-created
    // objects (created minus dropped) must all exist in the schema.
    const expected = schemaExpectedColumns();
    const { created, droppedColumns, droppedTables } = migrationSchemaObjects();
    const extras: string[] = [];
    for (const [table, columns] of created) {
      if (droppedTables.has(table)) continue;
      if (!expected.has(table)) {
        extras.push(`${table} (whole table unknown to schema.prisma)`);
        continue;
      }
      const dropped = droppedColumns.get(table) ?? new Set<string>();
      for (const column of columns) {
        if (!expected.get(table)!.has(column) && !dropped.has(column)) {
          extras.push(`${table}.${column}`);
        }
      }
    }
    expect(
      extras,
      `Migration-created objects schema.prisma does not declare (reverse drift — a future migrate dev would DROP these): ${extras.join(', ')}`
    ).toEqual([]);
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
