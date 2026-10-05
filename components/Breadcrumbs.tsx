import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { jsonLdString } from '@/lib/seo/json-ld';

export interface BreadcrumbItem {
  label: string;
  href?: string; // Optional - last item has no link
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * BreadcrumbList JSON-LD for a visual trail.
 *
 * Google requires an `item` URL on every ListItem except the last one. The
 * visual trail may carry an unlinked crumb in the middle (a job page shows a
 * city name with no link when that city has no page of its own), and emitting
 * that crumb without `item` made Search Console fail the whole breadcrumb
 * with 'Missing field "item"'. An unlinked middle crumb names no page, so it
 * is left out of the markup and the positions are renumbered. The final crumb
 * is the current page and is always kept.
 */
export function buildBreadcrumbSchema(items: BreadcrumbItem[], baseUrl: string) {
  const lastIndex = items.length - 1;
  const marked = items.filter((item, index) => Boolean(item.href) || index === lastIndex);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: marked.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: item.href ? `${baseUrl}${item.href}` : undefined,
    })),
  };
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

  // Generate JSON-LD schema for SEO
  const schemaData = buildBreadcrumbSchema(items, baseUrl);

  return (
    <>
      {/* Schema markup for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(schemaData) }}
      />

      {/* Visual breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center flex-wrap gap-1 text-sm">
          {items.map((item, index) => (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <ChevronRight
                  className="w-4 h-4 mx-1 flex-shrink-0"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-hidden="true"
                />
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className="bc-link flex items-center gap-1 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {index === 0 && <Home className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span
                  // Tighter cap on phones (where parents + separators are
                  // already eating row width) so the current crumb still
                  // shows a useful chunk before truncating.
                  className="font-medium truncate max-w-[140px] sm:max-w-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <style>{`
        .bc-link:hover {
          color: #2DD4BF !important;
        }
      `}</style>
    </>
  );
}
