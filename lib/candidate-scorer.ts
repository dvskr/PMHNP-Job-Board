import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════
// AI Candidate Scorer — Matches candidates to job requirements
// ═══════════════════════════════════════════════════════════════

interface ScoringResult {
  score: number;           // 0-100
  matchReasons: string[];  // Why they're a good fit
  missingItems: string[];  // What's lacking
}

const SCORING_PROMPT = `You are an expert PMHNP (Psychiatric Mental Health Nurse Practitioner) recruiter.
Score how well a candidate matches a specific job posting. Return ONLY valid JSON.

Required JSON structure:
{
  "score": number (0-100),
  "matchReasons": ["Reason 1", "Reason 2", ...] (max 6 items, each max 80 chars),
  "missingItems": ["Missing 1", "Missing 2", ...] (max 4 items, each max 80 chars)
}

Scoring guidelines:
- 90-100: Perfect match — meets all requirements, strong relevant experience
- 75-89: Strong match — meets most requirements, good experience
- 60-74: Moderate match — meets core requirements, some gaps
- 40-59: Partial match — meets some requirements, significant gaps
- 20-39: Weak match — meets few requirements
- 0-19: Poor match — does not align with role

Focus on:
- Required certifications (PMHNP-BC, DEA, etc.)
- License state match
- Years of experience vs requirements
- Specialties alignment
- Clinical settings match
- Screening question answers (especially knockout answers)

Be concise in reasons and missing items. Each should be a single clear statement.`;

/**
 * Score a candidate against a job posting
 * Called asynchronously after application submission
 */
export async function scoreCandidate(
  applicationId: string,
  jobId: string,
  userId: string
): Promise<void> {
  try {
    // Fetch job details
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        title: true,
        description: true,
        location: true,
        mode: true,
        experienceLevel: true,
        benefits: true,
        setting: true,
        population: true,
        state: true,
      },
    });

    if (!job) {
      logger.warn('scoreCandidate: Job not found', { jobId });
      return;
    }

    // Fetch candidate profile
    const candidate = await prisma.userProfile.findUnique({
      where: { supabaseId: userId },
      select: {
        firstName: true,
        lastName: true,
        headline: true,
        yearsExperience: true,
        certifications: true,
        licenseStates: true,
        specialties: true,
        skills: true,
        bio: true,
        npiNumber: true,
        deaNumber: true,
        education: { orderBy: { graduationDate: 'desc' }, take: 5 },
        workExperience: { orderBy: { startDate: 'desc' }, take: 5 },
        certificationRecords: { take: 10 },
        licenses: { take: 10 },
      },
    });

    if (!candidate) {
      logger.warn('scoreCandidate: Candidate not found', { userId });
      return;
    }

    // Fetch the application's screening answers
    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      select: { screeningAnswers: true, coverLetter: true },
    });

    // Build candidate summary for AI
    const candidateSummary = buildCandidateSummary(candidate, application);
    const jobSummary = buildJobSummary(job);

    // Call OpenAI
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SCORING_PROMPT },
        {
          role: 'user',
          content: `JOB POSTING:\n${jobSummary}\n\nCANDIDATE PROFILE:\n${candidateSummary}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.error('scoreCandidate: Empty AI response');
      return;
    }

    const result = JSON.parse(content) as ScoringResult;

    // Sanitize and clamp score
    const score = Math.max(0, Math.min(100, Math.round(result.score || 0)));
    const matchReasons = Array.isArray(result.matchReasons)
      ? result.matchReasons.filter((r): r is string => typeof r === 'string').slice(0, 6)
      : [];
    const missingItems = Array.isArray(result.missingItems)
      ? result.missingItems.filter((r): r is string => typeof r === 'string').slice(0, 4)
      : [];

    // Update the application with the score
    await prisma.jobApplication.update({
      where: { id: applicationId },
      data: {
        aiMatchScore: score,
        aiMatchReasons: matchReasons,
        aiMissingItems: missingItems,
      },
    });

    logger.info('AI scoring complete', { applicationId, score, matchReasons: matchReasons.length });
  } catch (err) {
    logger.error('scoreCandidate failed', err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCandidateSummary(candidate: any, application: any): string {
  const parts: string[] = [];

  if (candidate.headline) parts.push(`Headline: ${candidate.headline}`);
  if (candidate.yearsExperience) parts.push(`Years of Experience: ${candidate.yearsExperience}`);
  if (candidate.certifications) parts.push(`Certifications: ${candidate.certifications}`);
  if (candidate.licenseStates) parts.push(`Licensed States: ${candidate.licenseStates}`);
  if (candidate.specialties) parts.push(`Specialties: ${candidate.specialties}`);
  if (candidate.skills?.length) parts.push(`Skills: ${candidate.skills.join(', ')}`);
  if (candidate.npiNumber) parts.push('Has NPI Number: Yes');
  if (candidate.deaNumber) parts.push('Has DEA Number: Yes');
  if (candidate.bio) parts.push(`Bio: ${candidate.bio.slice(0, 300)}`);

  // Education
  if (candidate.education?.length > 0) {
    parts.push('Education:');
    for (const edu of candidate.education) {
      parts.push(`  - ${edu.degreeType} in ${edu.fieldOfStudy || 'N/A'} from ${edu.schoolName}`);
    }
  }

  // Work experience
  if (candidate.workExperience?.length > 0) {
    parts.push('Work Experience:');
    for (const exp of candidate.workExperience) {
      const dates = `${exp.startDate ? new Date(exp.startDate).getFullYear() : '?'} - ${exp.isCurrent ? 'Present' : exp.endDate ? new Date(exp.endDate).getFullYear() : '?'}`;
      parts.push(`  - ${exp.jobTitle} at ${exp.employerName} (${dates})`);
    }
  }

  // Certification records
  if (candidate.certificationRecords?.length > 0) {
    parts.push('Detailed Certifications:');
    for (const cert of candidate.certificationRecords) {
      parts.push(`  - ${cert.certificationName}${cert.certifyingBody ? ` (${cert.certifyingBody})` : ''}`);
    }
  }

  // Licenses
  if (candidate.licenses?.length > 0) {
    parts.push('Licenses:');
    for (const lic of candidate.licenses) {
      parts.push(`  - ${lic.licenseType} in ${lic.licenseState} (${lic.status})`);
    }
  }

  // Screening answers
  if (application?.screeningAnswers) {
    try {
      const answers = typeof application.screeningAnswers === 'string'
        ? JSON.parse(application.screeningAnswers)
        : application.screeningAnswers;
      if (Array.isArray(answers) && answers.length > 0) {
        parts.push('Screening Answers:');
        for (const a of answers) {
          parts.push(`  Q: ${a.questionText} → A: ${a.answer}`);
        }
      }
    } catch {
      // ignore malformed screening answers
    }
  }

  // Cover letter excerpt
  if (application?.coverLetter) {
    parts.push(`Cover Letter (excerpt): ${application.coverLetter.slice(0, 300)}`);
  }

  return parts.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildJobSummary(job: any): string {
  const parts: string[] = [];

  parts.push(`Title: ${job.title}`);
  if (job.location) parts.push(`Location: ${job.location}`);
  if (job.mode) parts.push(`Work Mode: ${job.mode}`);
  if (job.experienceLevel) parts.push(`Experience Level: ${job.experienceLevel}`);
  if (job.setting) parts.push(`Clinical Setting: ${job.setting}`);
  if (job.population) parts.push(`Patient Population: ${job.population}`);
  if (job.benefits?.length) parts.push(`Benefits: ${job.benefits.join(', ')}`);
  if (job.state) parts.push(`State: ${job.state}`);

  // Truncate description
  if (job.description) {
    parts.push(`Job Description:\n${job.description.slice(0, 2000)}`);
  }

  return parts.join('\n');
}
