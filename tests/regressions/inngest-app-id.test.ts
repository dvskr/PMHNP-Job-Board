import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Inngest app id is a cross-repo identity, not a label.
 *
 * Inngest keys an app by its id and rewrites that app's serve URL to whichever
 * deployment registered last. When a sibling product adopted this id (a copy of
 * lib/inngest/client.ts), it repointed the app at its own domain and every event
 * this codebase emitted was routed there instead. Nothing threw: recommendations,
 * the alert digest, and employer instant fan-out simply stopped executing for
 * two months. These assertions make an accidental id change fail CI instead of
 * silently rerouting production work.
 */
describe('Inngest app identity', () => {
  const source = readFileSync(join(process.cwd(), 'lib/inngest/client.ts'), 'utf8');

  it('keeps the app id this deployment is registered under', () => {
    expect(source).toContain("export const INNGEST_APP_ID = 'pmhnp-job-board'");
  });

  it('constructs the client from the exported constant, never a second literal', () => {
    expect(source).toMatch(/new Inngest\(\{\s*id:\s*INNGEST_APP_ID\s*,?\s*\}\)/);
    const literalIds = source.match(/id:\s*'[^']+'/g) ?? [];
    expect(literalIds).toEqual([]);
  });

  it('documents why the id must not be copied between codebases', () => {
    expect(source).toMatch(/unique across every product/i);
  });
});
