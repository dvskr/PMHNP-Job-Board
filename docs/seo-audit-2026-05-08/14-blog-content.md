# SEO Audit - Blog and Content Quality
Scope: /blog, /resources, /faq, sitemap coverage, RSS feed
Date: 2026-05-08

---

ITEM 1 - app/blog/layout.tsx (newly untracked file)

Verdict: Verified-clean
Location: app/blog/layout.tsx:1-21

The file is a font-scoping wrapper only. Loads Newsreader under CSS variable
--font-newsreader and wraps children in a single div. No metadata export, no
robots meta, no canonical override, no noindex directive. Does not emit any
HTTP header or alter the canonical chain. Scoping Newsreader to /blog/* is a
correct LCP optimization (removes one font request from every non-blog page).
No action required.

---

ITEM 2 - Author Byline / E-E-A-T

[HIGH] Author is Organization, not Person - YMYL E-E-A-T gap
Location: app/blog/[slug]/page.tsx:243-271

Issue: The BlogPosting JSON-LD names the author as Organization (PMHNP Hiring
/ Akari Labs LLC). The on-page byline (line 518-531) shows only PMHNP Hiring
with a P avatar placeholder. The inline comment at line 236-242 acknowledges
this: no real named PMHNP-BC reviewer has been contracted yet.

Google quality rater guidelines for YMYL (healthcare, clinical scope,
licensure) require demonstrable first-hand expertise from a named human with
verifiable credentials. Content about prescribing authority, DEA registration,
and psychiatric practice authority without a named credentialed author is the
single largest E-E-A-T risk on the site.

Fix: Contract at least one PMHNP-BC as contributing editor. Create an
/about/editorial-team page with their name, license number, state, and headshot.
Add author_name, author_title, author_license columns to blog_posts in Supabase.
Update JSON-LD author node to a Person type with jobTitle PMHNP-BC and a url
pointing to the editorial team page.

---

ITEM 3 - datePublished and dateModified

[HIGH] dateModified can equal datePublished permanently - freshness signal lost
Location: app/blog/[slug]/page.tsx:249

Issue: dateModified maps to post.updated_at from Supabase, set at insert time
and only changed when the post record is explicitly touched in the admin UI.
Posts never edited after publish have datePublished == dateModified forever.
Google uses dateModified to decide whether to re-crawl and whether to surface
the date in SERPs.

The author card at line 525 renders: Updated {new Date().getFullYear()} -
always the current year regardless of when the post was last touched. This
makes the visible badge inconsistent with the schema timestamp.

Fix: Add a reviewed_at nullable timestamp column to blog_posts. Emit
reviewed_at ?? updated_at as dateModified in schema. Update the author card
badge to use the real reviewed_at date. Establish a quarterly content review
cadence that sets reviewed_at.

---

ITEM 4 - Heading Hierarchy

[MEDIUM] Markdown single-hash headings in post content can produce duplicate H1s
Location: lib/blog.ts:281-284 and app/blog/[slug]/page.tsx:444

Issue: markdownToHtml() converts single-hash markdown headings to h1 elements
(lib/blog.ts:281-284). The page template already renders post.title as the
page-level h1 via the ed-title class at line 444. If any post body opens with
# Title, Googlebot sees two H1s on that page.

Fix: In markdownToHtml() at lib/blog.ts:281, change the single-hash conversion
to emit h2 rather than h1. Content is written assuming the page H1 comes from
the title field, not from markdown.

---

ITEM 5 - Reading Time

[LOW] Read-time divisor 238 WPM is high for clinical content
Location: app/blog/[slug]/page.tsx:231

Issue: Math.ceil(wordCount / 238). Standard editorial read-time for
technical/medical content uses 200-220 WPM. At 238 WPM a 3,000-word post
shows 13 min instead of a more accurate 14-15 min. Minor credibility signal.

Fix: Change 238 to 220.

---

ITEM 6 - FAQ Schema on Blog Posts

[MEDIUM] FAQPage schema hardcoded to 3 slugs - majority of blog ineligible for rich results
Location: app/blog/[slug]/page.tsx:296-406

Issue: blogFaqData is a hardcoded Record with entries for only:
- how-to-become-a-pmhnp
- new-grad-pmhnp-first-job
- pmhnp-vs-psychiatrist
- dynamic state-license slugs matching /^how-to-get-your-pmhnp-license-in-(.+)-2026/

Every other post gets no FAQPage schema. Posts containing Q&A sections in
their markdown body (likely the majority given the content pipeline) are
ineligible for FAQ rich results.

Fix: Add a faq_json column (JSONB) to blog_posts in Supabase. Populate it
from the n8n content generation pipeline. In page.tsx replace the hardcoded
lookup with: const faqQuestions = post.faq_json ?? blogFaqData[slug].
This unlocks FAQ rich results for all posts without per-slug code changes.


APPEND TEST
APPEND TEST 2

---

ITEM 7 - OG / Featured Image per Post

[LOW] Posts without image_url fall back to generic /api/og endpoint
Location: app/blog/[slug]/page.tsx:38

Issue: When post.image_url is null, OG image becomes https://pmhnphiring.com/api/og
the same generic computed image for every unillustrated post. Social shares of
different posts look identical on Twitter and LinkedIn, reducing click-through.

Fix: Ensure all published posts have image_url set in Supabase. As fallback,
create per-category default images in Supabase storage selected via post.category.
---

ITEM 8 - Blog Category Filter Canonical

Verdict: Verified-clean
Location: app/blog/page.tsx:16-27

The metadata export sets alternates.canonical to brand.baseUrl/blog unconditionally.
dynamic = force-dynamic means separate server renders per request, but the canonical
is always /blog regardless of searchParams.category. Googlebot receives the correct
canonical on every category-filtered render. No action required.

---

ITEM 9 - RSS Feed

[HIGH] No RSS feed exists anywhere on the site
Location: No app/feed.xml, app/feed/route.ts, or public/feed.xml found

Issue: No RSS or Atom feed for the blog.
- No discovery by Feedly, NewsBlur, or similar aggregators (backlink source)
- No eligibility for Google News inclusion
- No link rel alternate type application/rss+xml in document head
- No feed-based backlinks from content aggregators
With 80+ published posts and an active content pipeline this is a meaningful gap.

Fix: Create app/feed.xml/route.ts as a Next.js route handler. Use getAllPublishedSlugs()
from lib/blog.ts, fetch details for the 20 most recent posts, include title, description,
link, pubDate, and author per item. Add link rel alternate type application/rss+xml
to app/layout.tsx pointing to /feed.xml.

---

ITEM 10 - /resources Article Schemas

[HIGH] Article schemas on 1099-vs-w2 and fpa-guide missing image field
Location: app/resources/1099-vs-w2/page.tsx:68-82
Location: app/resources/fpa-guide/page.tsx:71-85

Issue: Both Article JSON-LD schemas omit the image property. Google structured data docs
list image as recommended for Article; without it the page is ineligible for Top Stories
and Discover carousels. Both pages have hero images but those URLs are not in the schema.

Fix: Add image to both Article schemas using the OG image URLs that already appear in
the metadata exports of each respective file.

[HIGH] Resource guide dateModified permanently hardcoded to 2026-03-19
Location: app/resources/1099-vs-w2/page.tsx:78
Location: app/resources/fpa-guide/page.tsx:79

Issue: Both pages hardcode datePublished: 2026-03-19 and dateModified: 2026-03-19 as
static strings. In six months these pages appear stale for queries like PMHNP full
practice authority 2026 or 1099 vs W2 PMHNP 2026, both of which include the year as
a freshness signal.

Fix: Create a LAST_REVIEWED constant per file, easy to grep and update on each quarterly
content review. Update dateModified on every review cycle.

[MEDIUM] /resources/private-practice-guide has HowTo and FAQPage but no Article schema
Location: app/resources/private-practice-guide/page.tsx:138-154

Issue: Page emits HowTo (6-step guide) and FAQPage (5 questions) but no Article schema.
Long-form editorial content, named publisher, and publish date qualify for Article rich
results. Without Article schema it is ineligible for Top Stories.

Fix: Add Article schema alongside the existing HowTo using the same datePublished,
Organization author, and publisher fields as the other resource guides.

[MEDIUM] /resources CollectionPage schema missing hasPart entity links
Location: app/resources/page.tsx:151-159

Issue: CollectionPage schema emits name, description, url, publisher, and numberOfItems
but no hasPart array. Without entity links Google cannot understand the hub-and-spoke
relationship between /resources and its deep guides. numberOfItems uses blogPosts.length
(all blog posts), semantically wrong since the CollectionPage describes the resource hub.

Fix: Add hasPart array with URLs for the three guide pages and correct numberOfItems.

---

ITEM 11 - /faq Page

Verdict: Verified-clean - FAQPage schema is comprehensive and server-rendered
Location: app/faq/page.tsx:199-216

FAQPage JSON-LD includes all 31 questions across 6 groups. Emitted as a server-rendered
script tag, not client-side JS. All Q&A pairs are substantive and PMHNP-domain-specific.
Canonical is set to /faq. H1 is present. BreadcrumbList schema is present.

[MEDIUM] FAQAccordion hides answer text from initial DOM
Location: components/FAQAccordion.tsx:63-70

Issue: Answer divs rendered with hidden={!isOpen}. While FAQPage schema contains all
answer text (server-rendered in the script tag), the visible HTML body has answers absent
from the DOM until JavaScript opens each item. If Googlebot indexes body text from the
first HTML parse before JS executes, answer body text is invisible. Only schema text
would be indexed. For a YMYL page with clinical content, this gap is a content-signal risk.

Fix: Render all FAQ answer divs without the hidden attribute. Use CSS height: 0;
overflow: hidden for collapsed state and a class toggle for height: auto on open.
Text stays in DOM at all times; visual collapse is CSS-only.

---

ITEM 12 - Related Posts Internal Linking

[MEDIUM] getRelatedPosts() returns empty for thin categories - Read Next section absent
Location: lib/blog.ts:137-158

Issue: Related posts fetched from same category only, limited to 3. Categories with fewer
than 4 published posts return 0-2 results. Read Next section renders only when
relatedPosts.length > 0. Posts in thin categories get no Read Next section and no
internal link to other content from that page.

Fix: After same-category query, if data.length < limit, run a fallback query fetching
recent posts from any category (excluding current slug and already-fetched slugs) and
pad up to the limit. Every post should have at least 3 related links.

---

ITEM 13 - autoLinkStates HTML Injection Risk

[MEDIUM] State auto-linker injects anchor tags after the sanitize-html boundary
Location: lib/blog.ts:442-467 and app/blog/[slug]/page.tsx:109

Issue: markdownToHtml() runs sanitize-html as its last step (lib/blog.ts:402).
The slug page then calls autoLinkStates() on the sanitized HTML (line 109), followed
by autoLinkCategories() (line 110). Both inject raw anchor tags after the sanitization
boundary. If either false-matches inside an HTML attribute value (e.g., id=washington-
state-guide partially matching Washington), it injects broken HTML that bypasses
sanitize-html. The negative lookbehind in autoLinkStates does not reliably exclude
all attribute contexts.

Fix: Either (a) apply auto-linking to markdown source before markdownToHtml() so both
pass through sanitize-html, or (b) run a second narrow sanitize-html pass after both
auto-linkers with allowedTags limited to anchor and allowedAttributes limited to href
and class.

---

ITEM 14 - Blog Post Hero Image LCP

[MEDIUM] Hero image uses CSS background-image instead of Next/Image - LCP not optimized
Location: app/blog/[slug]/page.tsx:471-476

Issue: The ed-hero-photo div renders the post featured image as an inline background-image
CSS style. This bypasses Next.js image optimization:
- No automatic WebP or AVIF conversion
- No fetchpriority=high (the hero is almost always the LCP element)
- No responsive srcset or sizes attribute
- No explicit width/height to prevent CLS
The blog card grid (app/blog/page.tsx:252-261) correctly uses Next Image with fill, sizes,
and quality=85. The hero image matters most for Core Web Vitals LCP.

Fix: Replace background-image div with Next Image using priority, fill, className object-cover,
and a sizes attribute. This sets fetchpriority=high automatically and generates srcset.

---

ITEM 15 - Sitemap Coverage

Verdict: Verified-clean - blog posts and resource guides all present
Location: app/sitemap.ts:121-162

Blog posts included via getAllPublishedSlugs() with lastModified from post.updated_at at
priority 0.8. Resource guides in landingPages at priority 0.8 with changeFrequency monthly.
/faq in staticPages at priority 0.5. No blog or resource page is missing.

[LOW] /resources sitemap entry uses STATIC_CONTENT_DATE not latestJobDate
Location: app/sitemap.ts:121

Issue: /resources is dynamically generated from Prisma queries (all published blog posts
and salary data). Its lastModified is STATIC_CONTENT_DATE (2026-05-04), which does not
update as new blog posts publish.

Fix: Change the /resources sitemap entry to use latestJobDate as lastModified,
consistent with /blog and /jobs.

---

ITEM 16 - Blog Index ItemList Schema

[LOW] ItemList schema sliced to 10 posts while page renders 12
Location: app/blog/page.tsx:124-138

Issue: Both BlogPosting and ItemList nodes use posts.slice(0, 10). POSTS_PER_PAGE is 12,
so schema covers only 10 of 12 rendered posts. Minor inconsistency between visible content
and schema.

Fix: Remove the .slice(0, 10) limit to match the actual rendered post count.

---

SUMMARY

Severity      Count  Key Items
-----------   -----  -----------------------------------------------
CRITICAL      0      None
HIGH          4      No RSS feed; no named Person author (E-E-A-T on YMYL);
                     Article schema missing image on resource guides;
                     dateModified hardcoded on resource guides
MEDIUM        8      FAQ schema limited to 3 slugs; hero not Next/Image;
                     thin related posts fallback missing; FAQAccordion DOM
                     hiding; autoLinkStates unsanitized post-sanitize-html;
                     duplicate H1 from markdown single-hash; CollectionPage
                     missing hasPart; private practice guide missing Article
LOW           4      Read-time divisor; OG image fallback; ItemList slice;
                     /resources sitemap date
Verified-     5      layout.tsx no noindex bomb; category filter canonical;
clean                related posts crawlability; placeholder content gating;
                     blog and resource sitemap coverage complete

KEY FILES
C:/Users/sathish.kumar/PMHNP-Job-Board/app/blog/layout.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/app/blog/page.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/app/blog/[slug]/page.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/lib/blog.ts
C:/Users/sathish.kumar/PMHNP-Job-Board/app/resources/page.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/app/resources/1099-vs-w2/page.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/app/resources/fpa-guide/page.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/app/resources/private-practice-guide/page.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/app/faq/page.tsx
C:/Users/sathish.kumar/PMHNP-Job-Board/app/sitemap.ts
C:/Users/sathish.kumar/PMHNP-Job-Board/components/FAQAccordion.tsx