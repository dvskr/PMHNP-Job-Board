import { describe, it, expect } from 'vitest';
import {
  customSupabaseHostsFrom,
  isOwnSupabaseStorageUrl,
} from '@/lib/supabase/origins';

describe('customSupabaseHostsFrom', () => {
  it('returns nothing when every URL is on the default supabase.co domain', () => {
    const hosts = customSupabaseHostsFrom([
      'https://abcdefghijklmnopqrst.supabase.co',
      'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public',
    ]);

    expect(hosts).toEqual([]);
  });

  it('extracts the bare hostname of an activated custom domain', () => {
    const hosts = customSupabaseHostsFrom(['https://api.pmhnphiring.com']);

    expect(hosts).toEqual(['api.pmhnphiring.com']);
  });

  it('deduplicates when auth and asset URLs share a custom host', () => {
    const hosts = customSupabaseHostsFrom([
      'https://api.pmhnphiring.com',
      'https://api.pmhnphiring.com/storage/v1/object/public',
    ]);

    expect(hosts).toEqual(['api.pmhnphiring.com']);
  });

  it('ignores unset and unparseable values instead of throwing', () => {
    const hosts = customSupabaseHostsFrom([undefined, '', 'not-a-url']);

    expect(hosts).toEqual([]);
  });
});

describe('isOwnSupabaseStorageUrl', () => {
  it('accepts a URL on the default supabase.co domain', () => {
    const url =
      'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/resumes/a.pdf';

    expect(isOwnSupabaseStorageUrl(url)).toBe(true);
  });

  it('rejects a lookalike host that merely ends in supabase.co', () => {
    const url = 'https://notsupabase.co/storage/v1/object/public/resumes/a.pdf';

    expect(isOwnSupabaseStorageUrl(url)).toBe(false);
  });

  it('rejects an unrelated host', () => {
    expect(isOwnSupabaseStorageUrl('https://evil.example.com/a.pdf')).toBe(false);
  });

  it('rejects non-https URLs', () => {
    const url = 'http://abcdefghijklmnopqrst.supabase.co/storage/a.pdf';

    expect(isOwnSupabaseStorageUrl(url)).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(isOwnSupabaseStorageUrl('://///')).toBe(false);
  });
});
