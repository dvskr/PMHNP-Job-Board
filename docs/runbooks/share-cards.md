# Share cards (og:image) runbook

> Audience: the operator, or anyone debugging a LinkedIn, Facebook, X or Slack link preview.
> Last updated: 2026-09-29

## How share images are built

- Every share image is rendered by `app/api/og/route.tsx` (1200x630, cream, teal and ink).
- Card text for static pages lives in `lib/seo/og-image.ts`: `PAGE_OG_CARDS` for pages, `SITE_OG_CARD` for the site-wide default card. The image sitemap (`lib/image-seo.ts`) reads the same registry.
- `tests/seo/page-og-cards.test.ts` enforces the copy rules (no digits, figures, years, superlatives, coverage or freshness claims) and checks that each page's og:image, its image sitemap entry and its Article JSON-LD image are the same card.
- Share text (og:title, og:description) for `/` and `/jobs` is static on purpose. The HTML title carries the live job count for search results; a count in a share preview freezes into the post and goes stale.

## Cache busters

Scrapers and the edge cache (30 days) key on the image URL, so a changed card only reaches them under a new URL. The `v` parameter is versioned per layout:

| Card | Constant | Current |
|---|---|---|
| Page and category cards | `PAGE_OG_VERSION` in `lib/seo/og-image.ts` | 3 |
| Site-wide default card | `SITE_OG_VERSION` in `lib/seo/og-image.ts` | 4 |
| Job cards | `app/jobs/[slug]/page.tsx` | 4 |

Bump the matching constant when that layout, or the site card's copy, changes. Page card copy changes need no bump: the text is in the URL.

## A preview still shows an old image

1. Confirm the production deployment on Vercel includes the change (compare its commit with `main`).
2. Ask each network to scrape again, for the exact URL that was shared:
   - LinkedIn: Post Inspector, https://www.linkedin.com/post-inspector/
   - Facebook: Sharing Debugger, https://developers.facebook.com/tools/debug/ then "Scrape Again"
   - X and Slack have no public re-scrape tool; they refresh when their own cache expires.
3. UTM links (`?utm_source=...`) are 301'd to the clean path by `middleware.ts`, so a network may hold cached entries for both. Inspect both the UTM URL and the clean URL.
4. A post that is already published keeps the preview it was created with. Delete and repost it if the old preview matters.
5. If a debugger shows the page but no image, check that the image fetch is not being challenged. Production runs Vercel challenge mode, and some image fetchers use a different user agent from the page scraper. If one is blocked, add a firewall bypass rule for the `/api/og` path.

After a card change, re-inspect at least: `/`, `/jobs`, `/for-employers`, `/pricing`, `/salary-guide`, `/about`.

## Blog post images

A blog post's og:image comes from `blog_posts.image_url`, not from code, so the source tests cannot see it. A null value falls back to the site-wide card. To check that no post still points at a retired page screenshot (read-only):

```sql
SELECT slug, status, image_url FROM blog_posts WHERE image_url LIKE '%images/pages/%';
```

Checked on 2026-09-29: no rows.

## History

The move from stored page screenshots to `/api/og` cards shipped inside commit `d3aded4`, whose message ("fix(inmail): stop charging employers for mail they did not send") does not mention it. It reached `main` in merge `68fd5f4`. Do not `git revert d3aded4` as a whole: that would restore the screenshots. To back out the InMail change alone, revert `lib/tier-limits.ts` and its tests.
