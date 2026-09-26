/**
 * Admin-only preview of a blog post, published or not.
 *
 * The Preview control on /admin/blog used to point straight at /blog/<slug>,
 * and the public loader filters on status='published', so previewing a draft
 * was a guaranteed 404: the only way to see a post before publishing it was to
 * publish it. This renders the same markdown pipeline the public page uses,
 * behind the admin layout's requireAdmin() gate.
 *
 * It deliberately does not reproduce the public page's TOC, share rail, JSON-LD
 * or signup blocks. Those are chrome; what an author needs before publishing is
 * the body as the reader will see it.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { markdownToHtml, autoLinkStates, resanitizeBlogHtml } from '@/lib/blog';
import { autoLinkCategories } from '@/lib/autoLink';
import { blogCategoryLabel } from '@/lib/blog-categories';
import { formatCT } from '@/lib/format-ct';
import '@/app/editorial.css';

// A draft changes every time the author saves. Caching the preview would show
// them the version before the one they just wrote.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Blog preview: Admin',
    robots: { index: false, follow: false },
};

interface Props {
    params: Promise<{ id: string }>;
}

export default async function AdminBlogPreviewPage({ params }: Props) {
    const { id } = await params;

    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) notFound();

    let contentHtml = markdownToHtml(post.content);
    contentHtml = autoLinkStates(contentHtml);
    contentHtml = autoLinkCategories(contentHtml);
    contentHtml = resanitizeBlogHtml(contentHtml);

    const isPublished = post.status === 'published';

    return (
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '12px 18px', borderRadius: 10, marginBottom: 28,
                backgroundColor: isPublished ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.12)',
                color: isPublished ? '#15803D' : '#B45309',
                fontSize: 13, fontWeight: 600,
            }}>
                <span>
                    {isPublished
                        ? 'This post is published. This preview is the admin copy.'
                        : 'Draft preview. This post is not on the public blog yet.'}
                </span>
                <Link href="/admin/blog" style={{ marginLeft: 'auto', color: 'inherit' }}>Back to Blog Management</Link>
                {isPublished && (
                    <Link href={`/blog/${post.slug}`} style={{ color: 'inherit' }}>Open the live page</Link>
                )}
            </div>

            <article>
                <h1 style={{ fontSize: 34, fontWeight: 700, color: '#1A2E35', lineHeight: 1.2 }}>{post.title}</h1>
                <p style={{ color: '#6B7F8A', fontSize: 13, margin: '10px 0 24px' }}>
                    {blogCategoryLabel(post.category)} · slug /blog/{post.slug} · last edited {formatCT(post.updatedAt, 'datetime')}
                </p>
                <div className="editorial-prose" dangerouslySetInnerHTML={{ __html: contentHtml }} />
            </article>
        </div>
    );
}
