/**
 * Security regression — auth client components must never console.log PII
 * (email/phone/password) or auth tokens to the BROWSER console. The audit found
 * app/auth/confirm/page.tsx logging data.session.user.email on every confirm.
 *
 * This scans the auth client surface and fails if any console.* logs a PII
 * property access or a token variable. Message strings (no leading dot) are fine.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

// matches a logged PII *value*: `.email` / `.phone` / `.password` property reads,
// or the supabase token variable names — NOT plain words inside a message string.
const PII_IN_LOG = /console\.(log|info|debug|warn)\([^)]*?(\.(email|phone|password)\b|access_token\b|refresh_token\b)/i;

describe('no PII in client console logs', () => {
  it('app/auth/** never console.logs email/phone/password/tokens', () => {
    const root = path.resolve(__dirname, '../../app/auth');
    const offenders: string[] = [];
    for (const f of walk(root)) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (PII_IN_LOG.test(line)) offenders.push(`${path.relative(root, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
