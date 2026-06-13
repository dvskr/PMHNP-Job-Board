/**
 * Regression (audit medium) — /jobs?category=new-grad returned fewer jobs than
 * /jobs/new-grad because the querystring builder omitted the newGradFriendly
 * structured-flag OR branch that the category-page builder included.
 */
import { describe, it, expect } from 'vitest';
import { buildWhereClause, parseFiltersFromParams } from '@/lib/filters';

function deepHas(obj: unknown, pred: (o: Record<string, unknown>) => boolean): boolean {
  if (Array.isArray(obj)) return obj.some((x) => deepHas(x, pred));
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    if (pred(rec)) return true;
    return Object.values(rec).some((v) => deepHas(v, pred));
  }
  return false;
}

describe('buildWhereClause — ?category=new-grad parity', () => {
  it('includes the newGradFriendly flag branch for ?category=new-grad', () => {
    const filters = parseFiltersFromParams(new URLSearchParams('category=new-grad'));
    const where = buildWhereClause(filters);
    const hasFlag = deepHas(where, (o) => o.newGradFriendly === true);
    expect(hasFlag).toBe(true);
  });

  it('does not add the flag for an unrelated category', () => {
    const filters = parseFiltersFromParams(new URLSearchParams('category=telehealth'));
    const where = buildWhereClause(filters);
    const hasFlag = deepHas(where, (o) => o.newGradFriendly === true);
    expect(hasFlag).toBe(false);
  });
});
