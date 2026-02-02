import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const postsDirectory = path.join(process.cwd(), 'content/blog');

export interface BlogPost {
    slug: string;
    title: string;
    description: string;
    date: string;
    lastUpdated?: string;
    author: string;
    category: 'salary' | 'career' | 'telehealth' | 'states' | 'new-grad' | 'interview';
    tags: string[];
    featured?: boolean;
    image?: string;
    content: string;
}

export function getPostSlugs() {
    if (!fs.existsSync(postsDirectory)) {
        return [];
    }
    return fs.readdirSync(postsDirectory);
}

export function getPostBySlug(slug: string): BlogPost {
    const realSlug = slug.replace(/\.mdx$/, '');
    const fullPath = path.join(postsDirectory, `${realSlug}.mdx`);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    return {
        slug: realSlug,
        title: data.title,
        description: data.description,
        date: new Date(data.date).toISOString(),
        lastUpdated: data.lastUpdated ? new Date(data.lastUpdated).toISOString() : undefined,
        author: data.author,
        category: data.category,
        tags: data.tags,
        featured: data.featured,
        image: data.image,
        content,
    };
}

export function getAllPosts(): BlogPost[] {
    const slugs = getPostSlugs();
    const posts = slugs
        .filter((slug) => slug.endsWith('.mdx'))
        .map((slug) => getPostBySlug(slug))
        // Sort posts by date in descending order
        .sort((post1, post2) => (post1.date > post2.date ? -1 : 1));
    return posts;
}

export function getPostsByCategory(category: string): BlogPost[] {
    const allPosts = getAllPosts();
    return allPosts.filter((post) => post.category === category);
}

export function getRelatedPosts(category: string, currentSlug: string, limit = 3): BlogPost[] {
    const allPosts = getAllPosts();
    return allPosts
        .filter((post) => post.category === category && post.slug !== currentSlug)
        .slice(0, limit);
}
