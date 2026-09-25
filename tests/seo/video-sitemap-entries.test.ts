/**
 * /video-sitemap.xml must be well formed and complete, entry by entry.
 *
 * Two ways it was not:
 *   1. youtube_video_id was interpolated raw into <loc>/<thumbnail_loc>/
 *      <player_loc>. /api/blog stores the value with no validation, so an id
 *      containing "&" produced malformed XML, and Google rejects the whole
 *      sitemap rather than the one entry.
 *   2. A post with no publish_date and no created_at emitted an empty
 *      <video:publication_date></video:publication_date>. The element must be
 *      a W3C datetime, so an empty one invalidates the entry.
 *
 * The invariant: every entry the route emits parses, and every element it
 * emits carries a legal value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Post = Record<string, unknown>;
let posts: Post[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({ data: posts, error: null }),
        }),
      }),
    }),
  }),
}));

async function body(): Promise<string> {
  const { GET } = await import('@/app/video-sitemap.xml/route');
  const res = await GET();
  return res.text();
}

const post = (over: Post = {}): Post => ({
  slug: 'pmhnp-salary-explained',
  title: 'PMHNP salary, explained',
  meta_description: 'What PMHNP postings advertise',
  youtube_video_id: 'dQw4w9WgXcQ',
  publish_date: '2026-04-01T00:00:00.000Z',
  created_at: '2026-03-01T00:00:00.000Z',
  ...over,
});

describe('video sitemap entries', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('emits a full entry for a well-formed post', async () => {
    posts = [post()];
    const xml = await body();
    expect(xml).toContain('<loc>https://pmhnphiring.com/blog/pmhnp-salary-explained</loc>');
    expect(xml).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(xml).toContain('<video:publication_date>2026-04-01</video:publication_date>');
  });

  it('never emits an empty publication_date element', async () => {
    posts = [post({ publish_date: null, created_at: null })];
    const xml = await body();
    expect(xml).not.toContain('<video:publication_date></video:publication_date>');
    expect(xml).not.toMatch(/<video:publication_date>\s*<\/video:publication_date>/);
    // The rest of the entry still ships.
    expect(xml).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('drops a post whose video id is not a YouTube id rather than emitting broken XML', async () => {
    posts = [post({ youtube_video_id: 'abc&def' }), post({ slug: 'good', youtube_video_id: 'dQw4w9WgXcQ' })];
    const xml = await body();
    expect(xml).not.toContain('abc&def');
    expect(xml).toContain('/blog/good');
  });

  it('says so in the log when it drops one, instead of failing silently', async () => {
    posts = [post({ youtube_video_id: '<script>' })];
    await body();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('malformed youtube_video_id'),
      expect.stringContaining('<script>'),
    );
  });

  it('escapes the slug it interpolates into <loc>', async () => {
    posts = [post({ slug: 'a&b' })];
    const xml = await body();
    expect(xml).toContain('/blog/a&amp;b');
    expect(xml).not.toMatch(/\/blog\/a&b/);
  });

  it('every emitted entry is well-formed XML with balanced tags', async () => {
    posts = [post(), post({ slug: 'two', publish_date: null, created_at: null })];
    const xml = await body();
    // A bare & (not part of an entity) is the failure mode Google rejects on.
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/);
    const opens = (xml.match(/<video:video>/g) || []).length;
    const closes = (xml.match(/<\/video:video>/g) || []).length;
    expect(opens).toBe(2);
    expect(closes).toBe(2);
  });
});
