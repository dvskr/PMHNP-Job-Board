import Link from 'next/link';
import { Metadata } from 'next';
import { getAllPosts } from '@/lib/blog';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
    title: 'PMHNP Career Blog | Expert Guides & Salary Data',
    description: 'Expert PMHNP career guides, salary data, interview tips, and job market insights. Updated weekly with data from 10,000+ job postings.',
    alternates: {
        canonical: 'https://pmhnphiring.com/blog',
    },
};

export default async function BlogIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ category?: string }>;
}) {
    const allPosts = getAllPosts();
    const { category } = await searchParams;
    const categoryFilter = category;

    const filteredPosts = categoryFilter
        ? allPosts.filter((post) => post.category === categoryFilter)
        : allPosts;

    // Format current date for specific "Last Updated" text styling requested
    const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const categories = [
        { id: 'all', label: 'All' },
        { id: 'salary', label: 'Salary' },
        { id: 'career', label: 'Career' },
        { id: 'telehealth', label: 'Telehealth' },
        { id: 'states', label: 'States' },
        { id: 'new-grad', label: 'New Grad' },
        { id: 'interview', label: 'Interview' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Breadcrumb Schema */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'BreadcrumbList',
                        itemListElement: [
                            {
                                '@type': 'ListItem',
                                position: 1,
                                name: 'Home',
                                item: 'https://pmhnphiring.com',
                            },
                            {
                                '@type': 'ListItem',
                                position: 2,
                                name: 'Blog',
                                item: 'https://pmhnphiring.com/blog',
                            },
                        ],
                    }),
                }}
            />

            {/* Hero Section */}
            <section className="bg-[#1e3a8a] text-white py-16 px-4" style={{ backgroundColor: '#1e3a8a' }}>
                <div className="max-w-6xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">PMHNP Career Insights</h1>
                    <p className="text-xl text-teal-100 max-w-2xl mx-auto">
                        Data-driven guides to help you navigate your psychiatric nurse practitioner career.
                    </p>
                    <div className="mt-8 text-sm text-teal-200 uppercase tracking-wider font-semibold">
                        Last Updated: {currentDate}
                    </div>
                </div>
            </section>

            {/* Filter Section */}
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="flex flex-wrap justify-center gap-2 mb-12">
                    <Link
                        href="/blog"
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${!categoryFilter
                            ? 'bg-teal-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                    >
                        All
                    </Link>
                    {categories.slice(1).map((cat) => (
                        <Link
                            key={cat.id}
                            href={`/blog?category=${cat.id}`}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${categoryFilter === cat.id
                                ? 'bg-teal-600 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                }`}
                        >
                            {cat.label}
                        </Link>
                    ))}
                </div>

                {/* Blog Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredPosts.length > 0 ? (
                        filteredPosts.map((post) => (
                            <Link key={post.slug} href={`/blog/${post.slug}`} className="group block h-full">
                                <article className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-200 h-full flex flex-col">
                                    {/* Image placeholder usage would go here if we had them, defaulting to gradient for now if no image */}
                                    <div className="h-48 bg-gradient-to-br from-teal-500 to-teal-400 p-6 flex items-end">
                                        <span className="bg-white/90 text-teal-900 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">
                                            {post.category}
                                        </span>
                                    </div>

                                    <div className="p-6 flex-1 flex flex-col">
                                        <div className="text-sm text-gray-500 mb-2">{new Date(post.date).toLocaleDateString()}</div>
                                        <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-teal-600 transition-colors line-clamp-2">
                                            {post.title}
                                        </h2>
                                        <p className="text-gray-600 text-sm line-clamp-3 mb-4 flex-1">
                                            {post.description}
                                        </p>
                                        <div className="text-teal-600 font-semibold text-sm flex items-center mt-auto">
                                            Read more <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
                                        </div>
                                    </div>
                                </article>
                            </Link>
                        ))
                    ) : (
                        <div className="col-span-full py-12 text-center text-gray-500">
                            No posts found in this category.
                        </div>
                    )}
                </div>
            </div>

            {/* Internal Links Footer */}
            <section className="border-t border-gray-200 mt-16 bg-white py-12">
                <div className="max-w-6xl mx-auto px-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">Browse More Resources</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Link href="/salary-guide" className="block p-4 rounded-lg bg-gray-50 hover:bg-teal-50 transition-colors text-center group">
                            <span className="text-2xl block mb-2">💰</span>
                            <span className="font-semibold text-gray-900 group-hover:text-teal-700">Salary Guide</span>
                        </Link>
                        <Link href="/jobs" className="block p-4 rounded-lg bg-gray-50 hover:bg-teal-50 transition-colors text-center group">
                            <span className="text-2xl block mb-2">🔍</span>
                            <span className="font-semibold text-gray-900 group-hover:text-teal-700">Browse All Jobs</span>
                        </Link>
                        <Link href="/jobs/remote" className="block p-4 rounded-lg bg-gray-50 hover:bg-teal-50 transition-colors text-center group">
                            <span className="text-2xl block mb-2">🏠</span>
                            <span className="font-semibold text-gray-900 group-hover:text-teal-700">Remote Jobs</span>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
