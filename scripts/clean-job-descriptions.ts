import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config();

// Custom Prisma client setup
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function cleanDescription(rawDescription: string): string {
  if (!rawDescription) return '';
  
  let cleaned = rawDescription;
  
  // Convert literal \n and \r\n strings to actual newlines
  cleaned = cleaned.replace(/\\r\\n/g, '\n');
  cleaned = cleaned.replace(/\\n/g, '\n');
  cleaned = cleaned.replace(/\\r/g, '\n');
  
  // Convert HTML block elements to newlines BEFORE stripping tags
  cleaned = cleaned.replace(/<\/p>/gi, '\n\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/div>/gi, '\n');
  cleaned = cleaned.replace(/<\/li>/gi, '\n');
  cleaned = cleaned.replace(/<li>/gi, '• ');
  cleaned = cleaned.replace(/<\/h[1-6]>/gi, '\n\n');
  cleaned = cleaned.replace(/<h[1-6][^>]*>/gi, '\n\n');
  
  // Remove all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&rsquo;/g, "'");
  cleaned = cleaned.replace(/&lsquo;/g, "'");
  cleaned = cleaned.replace(/&rdquo;/g, '"');
  cleaned = cleaned.replace(/&ldquo;/g, '"');
  cleaned = cleaned.replace(/&mdash;/g, '—');
  cleaned = cleaned.replace(/&ndash;/g, '–');
  cleaned = cleaned.replace(/&bull;/g, '•');
  cleaned = cleaned.replace(/&#x27;/g, "'");
  cleaned = cleaned.replace(/&#x2F;/g, '/');
  cleaned = cleaned.replace(/&hellip;/g, '...');
  cleaned = cleaned.replace(/&apos;/g, "'");
  cleaned = cleaned.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  cleaned = cleaned.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // Remove duplicate headers (e.g., "Job Description Job Description:")
  cleaned = cleaned.replace(/^(Job Description[:\s]*){2,}/i, 'Job Description:\n\n');
  cleaned = cleaned.replace(/\n(Job Description[:\s]*){2,}/gi, '\nJob Description:\n\n');
  
  // Remove common repetitive prefixes
  cleaned = cleaned.replace(/^Job Description[:\s]*Job Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Job Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Description[:\s]*Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Description[:\s]*/i, '');
  
  // Clean up whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');           // Multiple spaces to single
  cleaned = cleaned.replace(/\n[ \t]+/g, '\n');        // Remove leading spaces on lines
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');        // Remove trailing spaces on lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');        // Max 2 newlines (1 blank line)
  cleaned = cleaned.trim();
  
  return cleaned;
}

async function cleanJobDescriptions() {
  try {
    console.log('🧹 Cleaning Job Descriptions\n');
    console.log('='.repeat(60));

    // Fetch all jobs with descriptions
    const jobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        description: {
          not: '',
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        descriptionSummary: true,
      },
    });

    console.log(`\n📊 Found ${jobs.length} jobs to process\n`);

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    // Sample tracking
    const samples: Array<{
      title: string;
      before: string;
      after: string;
    }> = [];

    for (const job of jobs) {
      try {
        if (!job.description) {
          unchanged++;
          continue;
        }

        const cleanedDescription = cleanDescription(job.description);
        const cleanedSummary = cleanedDescription.slice(0, 300) + (cleanedDescription.length > 300 ? '...' : '');

        // Only update if changed
        if (cleanedDescription !== job.description) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              description: cleanedDescription,
              descriptionSummary: cleanedSummary,
            },
          });

          updated++;

          // Save first 3 samples
          if (samples.length < 3) {
            samples.push({
              title: job.title,
              before: job.description.slice(0, 150),
              after: cleanedDescription.slice(0, 150),
            });
          }
        } else {
          unchanged++;
        }
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        errors++;
      }
    }

    console.log('\n✅ Cleaning Complete\n');
    console.log('📈 STATISTICS:');
    console.log(`   Total jobs: ${jobs.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Unchanged: ${unchanged}`);
    console.log(`   Errors: ${errors}`);

    if (samples.length > 0) {
      console.log('\n📝 SAMPLE UPDATES:\n');
      samples.forEach((sample, idx) => {
        console.log(`${idx + 1}. ${sample.title}`);
        console.log(`   BEFORE: ${sample.before}...`);
        console.log(`   AFTER:  ${sample.after}...`);
        console.log();
      });
    }

    await pool.end();
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error cleaning descriptions:', error);
    await pool.end();
    await prisma.$disconnect();
    process.exit(1);
  }
}

cleanJobDescriptions();

