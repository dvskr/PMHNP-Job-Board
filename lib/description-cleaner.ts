import { prisma } from './prisma';

function cleanDescription(rawDescription: string): string {
  if (!rawDescription) return '';

  let cleaned = rawDescription;

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

  // Remove duplicate headers
  cleaned = cleaned.replace(/^(Job Description[:\s]*){2,}/i, 'Job Description:\n\n');
  cleaned = cleaned.replace(/\n(Job Description[:\s]*){2,}/gi, '\nJob Description:\n\n');

  // Remove common repetitive prefixes
  cleaned = cleaned.replace(/^Job Description[:\s]*Job Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Job Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Description[:\s]*Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Description[:\s]*/i, '');

  // Clean up whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n[ \t]+/g, '\n');
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}

export async function cleanAllJobDescriptions(): Promise<{
  total: number;
  cleaned: number;
  skipped: number;
  errors: number;
}> {
  console.log('[POST-INGESTION CLEANUP] Checking for jobs with HTML tags...');

  // Get all jobs
  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      description: true,
      descriptionSummary: true,
    },
  });

  let cleaned = 0;
  let skipped = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      // Check if description has HTML tags
      const hasHtml = /<[^>]+>/.test(job.description || '') || /<[^>]+>/.test(job.descriptionSummary || '');

      if (!hasHtml) {
        skipped++;
        continue;
      }

      // Clean the description
      const cleanedDescription = cleanDescription(job.description || '');
      const cleanedSummary = cleanedDescription.slice(0, 300) + (cleanedDescription.length > 300 ? '...' : '');

      // Update the job
      await prisma.job.update({
        where: { id: job.id },
        data: {
          description: cleanedDescription,
          descriptionSummary: cleanedSummary,
        },
      });

      cleaned++;
    } catch (error) {
      console.error(`[POST-INGESTION CLEANUP] Error cleaning job ${job.id}:`, error);
      errors++;
    }
  }

  const result = {
    total: jobs.length,
    cleaned,
    skipped,
    errors,
  };

  if (cleaned > 0) {
    console.log(`[POST-INGESTION CLEANUP] ✨ Cleaned ${cleaned} jobs, ${skipped} already clean, ${errors} errors`);
  } else {
    console.log(`[POST-INGESTION CLEANUP] ✓ All ${skipped} jobs already clean`);
  }

  return result;
}

