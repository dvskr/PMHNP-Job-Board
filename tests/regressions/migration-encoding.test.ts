/**
 * Migrations must be plain UTF-8, with no byte-order mark.
 *
 * Windows PowerShell 5.1 writes a BOM (EF BB BF) for `Set-Content -Encoding
 * utf8` and `Out-File`. Postgres does not strip it: the BOM lands glued to
 * the first token, so a file that opens with a `--` comment fails with a
 * syntax error on its very first byte. Prisma then records the migration as
 * failed (P3009) and refuses to apply ANY later migration until someone
 * resolves it by hand, so one invisible character blocks every deploy behind
 * it.
 *
 * It happened once already, to 20260913b_add_employer_job_discount_hold_key,
 * and nothing in review can see it: the file looks identical in every editor.
 * This test is the only place it is visible.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../prisma/migrations');

const migrationFiles = fs
  .readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(MIGRATIONS, d.name, 'migration.sql'))
  .filter((f) => fs.existsSync(f));

describe('prisma migrations are BOM-free UTF-8', () => {
  it('finds the migrations it is meant to check', () => {
    // Guards the guard: a wrong path would make every assertion below vacuous.
    expect(migrationFiles.length).toBeGreaterThan(10);
  });

  it('no migration.sql starts with a byte-order mark', () => {
    const withBom = migrationFiles
      .filter((f) => {
        const head = fs.readFileSync(f).subarray(0, 3);
        return head.length === 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
      })
      .map((f) => path.basename(path.dirname(f)));

    expect(
      withBom,
      `these migrations start with a UTF-8 BOM and will fail in Postgres (P3009). ` +
        `Rewrite them without one, e.g. [IO.File]::WriteAllText(path, text, ` +
        `(New-Object Text.UTF8Encoding($false))):\n  ${withBom.join('\n  ')}`,
    ).toEqual([]);
  });
});
