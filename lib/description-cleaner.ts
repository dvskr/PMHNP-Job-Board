import { prisma } from './prisma';

// Helper to escape regex special characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cleanDescription(rawDescription: string): string {
  if (!rawDescription) return '';

  let cleaned = rawDescription;

  // 1. Remove specific encoding artifacts
  cleaned = cleaned.replace(new RegExp(String.fromCharCode(65533), 'g'), ''); // Remove 
  cleaned = cleaned.replace(/â€™/g, "'");
  cleaned = cleaned.replace(/â€“/g, "–");
  cleaned = cleaned.replace(/â€œ/g, '"');
  cleaned = cleaned.replace(/â€/g, '"');
  cleaned = cleaned.replace(/Â/g, ''); // frequent artifact

  // 2. Decode HTML entities
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

  // 3. Convert literal \n and \r\n strings to actual newlines
  cleaned = cleaned.replace(/\\r\\n/g, '\n');
  cleaned = cleaned.replace(/\\n/g, '\n');
  cleaned = cleaned.replace(/\\r/g, '\n');

  // 4. Convert HTML block elements to newlines
  cleaned = cleaned.replace(/<\/p>/gi, '\n\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/div>/gi, '\n');
  cleaned = cleaned.replace(/<\/li>/gi, '\n');
  cleaned = cleaned.replace(/<li>/gi, '• ');
  cleaned = cleaned.replace(/<\/h[1-6]>/gi, '\n\n');
  cleaned = cleaned.replace(/<h[1-6][^>]*>/gi, '\n\n');

  // 5. Remove all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // 6. Section Header Cleaning (Boilerplate removal)
  // Remove Adzuna Preview Boilerplate
  cleaned = cleaned.replace(/^Preview: This is a summary from adzuna[\s\S]*?application details\.?/i, '');

  // Remove "Who We Are" or "About Us" if it appears at the very start
  cleaned = cleaned.replace(/^\s*(?:>|•|-)?\s*(?:Who We Are|About Us|About the Company|Company Overview)[:\s]*/i, '');

  // Remove "Job Description" headers
  cleaned = cleaned.replace(/^(Job Description|Position Summary|Role Overview)[:\s]*/i, '');
  cleaned = cleaned.replace(/\n(Job Description|Position Summary|Role Overview)[:\s]*/gi, '\n');

  // 7. Remove repeated title/company lines (heuristic)
  // e.g. "Psychiatric Nurse Practitioner Matrix Providers..."
  const lines = cleaned.split('\n');
  if (lines.length > 0 && lines[0].length < 100) {
    // If first line is very short, it might be a title repeater
    const firstLine = lines[0].trim().toLowerCase();
    // Logic to detect if it's just the title again could be complex, skipping for now to avoid false positives
  }

  // 8. Clean up whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');           // Multiple spaces to single
  cleaned = cleaned.replace(/\n[ \t]+/g, '\n');        // Remove leading spaces on lines
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');        // Remove trailing spaces on lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');        // Max 2 newlines

  return cleaned.trim();
}

export async function cleanAllJobDescriptions(): Promise<{
  total: number;
  cleaned: number;
  skipped: number;
  errors: number;
}> {
  console.log('[POST-INGESTION CLEANUP] Checking for jobs with HTML tags...');

  // Only fetch jobs that likely have HTML (contains < character)
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { description: { contains: '<' } },
        { descriptionSummary: { contains: '<' } },
      ],
    },
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

