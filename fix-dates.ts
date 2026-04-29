import 'dotenv/config';
import { prisma } from './lib/prisma';

async function checkDatePublished() {
  const posts = await prisma.blogPost.findMany({
    where: {
      status: 'published',
      publishDate: null
    }
  });
  
  console.log(`Found ${posts.length} published posts with null publishDate`);
  
  if (posts.length > 0) {
    for (const post of posts) {
      await prisma.blogPost.update({
        where: { id: post.id },
        data: { publishDate: post.createdAt }
      });
      console.log(`Fixed post: ${post.slug}`);
    }
    console.log('All posts updated successfully.');
  }

  // Also check metadata mismatch
  const allPosts = await prisma.blogPost.findMany({
    where: { status: 'published' }
  });
  console.log(`Total published posts: ${allPosts.length}`);
}

checkDatePublished()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
