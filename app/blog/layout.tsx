import { Newsreader } from 'next/font/google';
import type { Metadata } from 'next';

/**
 * Blog-segment layout: loads Newsreader only for /blog/* routes.
 *
 * Newsreader is the editorial serif used by `app/editorial.css` for blog post
 * body typography. It was previously preloaded on EVERY page from the root
 * layout, costing one extra font request per non-blog page load. Scoping it
 * here keeps it where it's actually used.
 *
 * The CSS variable `--font-newsreader` is consumed by `app/editorial.css:36`.
 */
const newsreader = Newsreader({
    variable: '--font-newsreader',
    subsets: ['latin'],
    display: 'swap',
});

// Feed discovery — when a user lands on any /blog/* page, browsers and
// feed readers (Feedly, Inoreader, NetNewsWire) auto-detect the blog RSS
// feed via this <link rel="alternate"> tag. Companion to the jobs feed
// link in app/layout.tsx (/feed.xml).
export const metadata: Metadata = {
    alternates: {
        types: {
            'application/rss+xml': [
                { url: '/blog/feed.xml', title: 'PMHNP Hiring — Career Blog & Insights' },
            ],
        },
    },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
    return <div className={newsreader.variable}>{children}</div>;
}
