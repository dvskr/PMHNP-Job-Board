/**
 * F2 regression — SaveJobButton (array shape) and useSavedJobs (map shape)
 * both read/write localStorage['savedJobs'] with incompatible serializations,
 * so saving from the job-detail page corrupted the list-page saved state.
 *
 * The fix introduces lib/saved-jobs.ts as the single source of truth (canonical
 * map shape { [jobId]: isoDate }) consumed by BOTH. These tests pin the contract
 * of that shared module: round-trip, idempotent toggle, dedupe, and graceful
 * tolerance of legacy-array / corrupt / scalar localStorage values.
 *
 * Vitest env is 'node' — no DOM — so we install a minimal localStorage stub
 * BEFORE importing the module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => (key in store ? store[key] : null),
  setItem: (key: string, value: string): void => { store[key] = value; },
  removeItem: (key: string): void => { delete store[key]; },
  clear: (): void => { for (const k in store) delete store[k]; },
};

Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

import { read, isSaved, add, remove, toggle, SAVED_JOBS_KEY } from '@/lib/saved-jobs';

const rawGet = () => localStorageMock.getItem(SAVED_JOBS_KEY);
const rawSet = (val: string) => localStorageMock.setItem(SAVED_JOBS_KEY, val);

beforeEach(() => {
  localStorageMock.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

describe('read()', () => {
  it('returns {} when the key is absent', () => {
    expect(read()).toEqual({});
  });

  it('returns the stored map on a valid map value', () => {
    const map = { 'job-1': '2026-01-01T00:00:00.000Z' };
    rawSet(JSON.stringify(map));
    expect(read()).toEqual(map);
  });

  it('converts a legacy array to a map and re-persists it (the F2 root cause)', () => {
    rawSet(JSON.stringify(['job-1', 'job-2']));
    const result = read();
    expect(result).toHaveProperty('job-1');
    expect(result).toHaveProperty('job-2');
    expect(typeof result['job-1']).toBe('string');
    const repersisted = JSON.parse(rawGet()!);
    expect(Array.isArray(repersisted)).toBe(false);
    expect(repersisted).toHaveProperty('job-1');
  });

  it('returns {} and does not throw on corrupt JSON', () => {
    rawSet('{not valid json!!!');
    expect(() => read()).not.toThrow();
    expect(read()).toEqual({});
  });

  it('returns {} on a bare-number JSON value', () => {
    rawSet('42');
    expect(read()).toEqual({});
  });

  it('returns {} on a JSON null value', () => {
    rawSet('null');
    expect(read()).toEqual({});
  });

  it('returns {} on a JSON string value', () => {
    rawSet('"hello"');
    expect(read()).toEqual({});
  });
});

describe('isSaved()', () => {
  it('false when not present, true after add, false after remove', () => {
    expect(isSaved('job-42')).toBe(false);
    add('job-42');
    expect(isSaved('job-42')).toBe(true);
    remove('job-42');
    expect(isSaved('job-42')).toBe(false);
  });
});

describe('add()', () => {
  it('round-trip: add then read contains the id', () => {
    add('job-1');
    expect(read()).toHaveProperty('job-1');
  });

  it('stores an ISO date string as the value', () => {
    add('job-1');
    expect(new Date(read()['job-1']).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('dedupe: adding the same id twice keeps exactly one entry', () => {
    add('job-1');
    add('job-1');
    expect(Object.keys(read()).filter((k) => k === 'job-1')).toHaveLength(1);
  });

  it('is idempotent: second call returns same map as first', () => {
    expect(add('job-1')).toEqual(add('job-1'));
  });
});

describe('remove()', () => {
  it('is idempotent: removing a non-existent id is a no-op', () => {
    expect(remove('does-not-exist')).toEqual(read());
  });

  it('does not remove other ids', () => {
    add('job-1');
    add('job-2');
    remove('job-1');
    expect(read()).toHaveProperty('job-2');
    expect(read()).not.toHaveProperty('job-1');
  });
});

describe('toggle()', () => {
  it('toggle twice returns to original (idempotent pair)', () => {
    expect(isSaved('job-1')).toBe(false);
    toggle('job-1');
    expect(isSaved('job-1')).toBe(true);
    toggle('job-1');
    expect(isSaved('job-1')).toBe(false);
  });

  it('toggle three times ends saved', () => {
    toggle('job-1');
    toggle('job-1');
    toggle('job-1');
    expect(isSaved('job-1')).toBe(true);
  });
});

describe('immutability', () => {
  it('add returns a fresh snapshot each call', () => {
    const first = add('job-1');
    const second = add('job-2');
    expect(first).not.toHaveProperty('job-2');
    expect(second).toHaveProperty('job-1');
    expect(second).toHaveProperty('job-2');
  });
});
