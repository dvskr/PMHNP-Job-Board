/**
 * Regression (audit H11) — 18 models in schema.prisma had no CREATE TABLE in any
 * migration (they were created on prod via `db push`), so `prisma migrate deploy`
 * could not build a fresh database. This test fails the moment a schema model
 * lacks a corresponding CREATE TABLE somewhere in prisma/migrations.
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

describe('prisma migrations cover the schema', () => {
  it('every model in schema.prisma has a CREATE TABLE in some migration', () => {
    const schemaTables = schemaTableNames();
    const migrated = migrationCreatedTables();
    const missing = schemaTables.filter((t) => !migrated.has(t));
    expect(missing, `Tables in schema.prisma with no migration CREATE TABLE: ${missing.join(', ')}`).toEqual([]);
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
