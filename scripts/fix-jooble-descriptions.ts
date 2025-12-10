import { prisma } from '../lib/prisma'

function cleanDescription(text: string): string {
  if (!text) return '';
  
  let cleaned = text.trim();
  
  // Remove ALL ellipsis markers
  cleaned = cleaned.replace(/\.{2,}/g, ' ');
  
  // Remove common snippet artifacts
  cleaned = cleaned.replace(/^Description Summary:\s*/i, '');
  cleaned = cleaned.replace(/^About (this|the) (role|position|job):\s*/i, '');
  cleaned = cleaned.replace(/^\s*Description:\s*/i, '');
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // Add proper ending if it doesn't have punctuation
  if (cleaned && !cleaned.match(/[.!?]$/)) {
    cleaned += '.';
  }
  
  return cleaned;
}

function createSummary(description: string): string {
  const cleaned = cleanDescription(description);
  if (cleaned.length <= 300) return cleaned;
  
  // Try to cut at sentence boundary
  const truncated = cleaned.substring(0, 300);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastPeriod > 200) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

async function fixJoobleDescriptions() {
  console.log('Fixing Jooble job descriptions...\n')
  
  const jobs = await prisma.job.findMany({
    where: {
      sourceProvider: 'jooble'
    }
  })

  console.log(`Found ${jobs.length} Jooble jobs to fix\n`)

  let updated = 0;
  
  for (const job of jobs) {
    const cleanedDescription = cleanDescription(job.description);
    const cleanedSummary = createSummary(cleanedDescription);
    
    if (cleanedDescription !== job.description || cleanedSummary !== job.descriptionSummary) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          description: cleanedDescription,
          descriptionSummary: cleanedSummary,
        }
      })
      updated++;
    }
  }

  console.log(`✅ Updated ${updated} job descriptions`)
  console.log(`✨ Skipped ${jobs.length - updated} (already clean)`)
}

fixJoobleDescriptions()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

