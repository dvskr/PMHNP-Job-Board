import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

export const maxDuration = 300; // 5 minutes

const BATCH_SIZE = 5;        // 5 concurrent LLM calls
const MAX_JOBS_PER_RUN = 200; // Process up to 200 jobs per run
const TIME_BUDGET_MS = 250_000; // 250s (Vercel 300s max)
const BATCH_DELAY_MS = 200;

// GPT-4o-mini pricing (per 1M tokens)
const INPUT_COST_PER_1M = 0.15;  // $0.15 per 1M input tokens
const OUTPUT_COST_PER_1M = 0.60; // $0.60 per 1M output tokens

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// US state name -> code mapping
const STATE_CODES: Record<string, string> = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
  'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH',
  'new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
  'north dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA',
  'rhode island':'RI','south carolina':'SC','south dakota':'SD','tennessee':'TN',
  'texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA',
  'west virginia':'WV','wisconsin':'WI','wyoming':'WY','district of columbia':'DC'
};

interface LLMResult {
  salary_min?: number;
  salary_max?: number;
  salary_period?: string;
  job_type?: string;
  work_mode?: string;
  city?: string;
  state?: string;
  experience_level?: string;
  clinical_setting?: string;
  patient_population?: string;
  benefits?: string[];
}

interface LLMResponse {
  result: LLMResult | null;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM_PROMPT = `You extract structured job posting data. Return JSON with ONLY fields you can CONFIDENTLY find. Never guess or fabricate.

Fields:
- salary_min: number, minimum annual salary in USD. Convert: hourly×2080, monthly×12, weekly×52
- salary_max: number, maximum annual salary in USD
- salary_period: "hour", "month", or "year" (original unit BEFORE conversion)
- job_type: "Full-Time", "Part-Time", "Contract", "Per Diem", or "PRN"
- work_mode: "Remote", "On-site", "Hybrid", or "Telehealth"
- city: string, job city (not employer HQ)
- state: string, full US state name
- experience_level: "Entry Level", "Mid Level", "Senior Level", or "Director"
- clinical_setting: e.g. "Outpatient", "Inpatient", "Residential", "Emergency", "Community Health", "Private Practice", "Correctional", "Telehealth", "Hospital"
- patient_population: e.g. "Adults", "Children", "Adolescents", "Geriatric", "All Ages", "Veterans", "Substance Abuse"
- benefits: string array, e.g. ["Health Insurance", "401k", "PTO", "CME Allowance", "Malpractice Coverage", "Student Loan Repayment", "Signing Bonus", "Relocation Assistance"]

Rules:
- ONLY include if explicitly stated in text
- Salary must be $40k-$500k/yr range for PMHNP roles
- Return {} if nothing found`;

async function extractWithLLM(description: string, title: string, employer: string, location: string): Promise<LLMResponse> {
  try {
    const truncated = description.substring(0, 2500);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Title: ${title}\nEmployer: ${employer}\nLocation: ${location}\n\n${truncated}`
        }
      ],
      temperature: 0,
      max_tokens: 300,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    const content = response.choices[0]?.message?.content;
    if (!content) return { result: null, inputTokens, outputTokens };

    const parsed = JSON.parse(content);

    // Validate salary
    if (parsed.salary_min && (parsed.salary_min < 40000 || parsed.salary_min > 500000)) {
      delete parsed.salary_min;
      delete parsed.salary_max;
      delete parsed.salary_period;
    }

    const result = Object.keys(parsed).length > 0 ? parsed : null;
    return { result, inputTokens, outputTokens };
  } catch {
    return { result: null, inputTokens: 0, outputTokens: 0 };
  }
}

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const startTime = Date.now();

  try {
    console.log('[Enrich Jobs] Starting LLM enrichment...');

    // Find published jobs that need enrichment:
    // - Have descriptions (>100 chars)
    // - Missing key data fields
    // - NOT already enriched (lastEnrichedAt is null)
    // - Order by newest first (enrich fresh jobs first)
    const jobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        description: { not: '' },
        lastEnrichedAt: null,  // Skip already-processed jobs
        OR: [
          { normalizedMinSalary: null },
          { jobType: null },
          { mode: null },
          { city: null },
          { state: null },
          { setting: null },
          { population: null },
        ],
      },
      select: {
        id: true,
        title: true,
        employer: true,
        location: true,
        description: true,
        normalizedMinSalary: true,
        jobType: true,
        mode: true,
        city: true,
        state: true,
        stateCode: true,
        isRemote: true,
        isHybrid: true,
        experienceLevel: true,
        setting: true,
        population: true,
        benefits: true,
        sourceProvider: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_JOBS_PER_RUN,
    });

    console.log(`[Enrich Jobs] Processing ${jobs.length} jobs...`);

    if (jobs.length === 0) {
      return NextResponse.json({ success: true, message: 'No jobs need enrichment', processed: 0 });
    }

    const stats = {
      processed: 0, enriched: 0, salaryUpdated: 0, jobTypeUpdated: 0, modeUpdated: 0,
      cityUpdated: 0, stateUpdated: 0, settingUpdated: 0, populationUpdated: 0,
      expLevelUpdated: 0, benefitsUpdated: 0, errors: 0, noData: 0,
      totalInputTokens: 0, totalOutputTokens: 0,
    };

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      // Time budget check
      if (Date.now() - startTime >= TIME_BUDGET_MS) {
        console.warn(`[Enrich Jobs] Time budget exhausted at ${stats.processed}/${jobs.length}`);
        break;
      }

      const batch = jobs.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (job) => {
          if (!job.description || job.description.length < 100) return null;
          const llmResponse = await extractWithLLM(job.description, job.title, job.employer, job.location);
          return { job, ...llmResponse };
        })
      );

      for (const r of results) {
        stats.processed++;
        if (r.status === 'rejected' || !r.value) { stats.errors++; continue; }

        const { job, result: extracted, inputTokens, outputTokens } = r.value;

        // Track token usage
        stats.totalInputTokens += inputTokens;
        stats.totalOutputTokens += outputTokens;

        // Build Prisma update data — ALWAYS set lastEnrichedAt to prevent re-processing
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: Record<string, any> = {
          lastEnrichedAt: new Date(),
        };

        if (!extracted) {
          // Even if no data found, mark as enriched so we don't re-process
          stats.noData++;
          try {
            await prisma.job.update({ where: { id: job.id }, data: updateData });
          } catch { /* ignore */ }
          continue;
        }

        let fieldsUpdated = 0;

        // Salary (only if missing)
        if (extracted.salary_min && !job.normalizedMinSalary) {
          const min = Math.round(extracted.salary_min);
          const max = Math.round(extracted.salary_max || extracted.salary_min);
          updateData.normalizedMinSalary = min;
          updateData.normalizedMaxSalary = max;
          updateData.minSalary = min;
          updateData.maxSalary = max;
          updateData.salaryIsEstimated = true;
          updateData.salaryConfidence = 0.7;
          if (extracted.salary_period) updateData.salaryPeriod = extracted.salary_period;
          const dispMin = `$${Math.round(min / 1000)}k`;
          const dispMax = `$${Math.round(max / 1000)}k`;
          updateData.displaySalary = `${dispMin} - ${dispMax}/yr`;
          stats.salaryUpdated++;
          fieldsUpdated++;
        }

        // Job Type
        if (extracted.job_type && !job.jobType) {
          updateData.jobType = extracted.job_type;
          stats.jobTypeUpdated++;
          fieldsUpdated++;
        }

        // Work Mode
        if (extracted.work_mode && !job.mode) {
          updateData.mode = extracted.work_mode;
          if (extracted.work_mode === 'Remote' || extracted.work_mode === 'Telehealth') {
            updateData.isRemote = true;
          }
          if (extracted.work_mode === 'Hybrid') {
            updateData.isHybrid = true;
          }
          stats.modeUpdated++;
          fieldsUpdated++;
        }

        // City
        if (extracted.city && !job.city) {
          updateData.city = extracted.city;
          stats.cityUpdated++;
          fieldsUpdated++;
        }

        // State
        if (extracted.state && !job.state) {
          updateData.state = extracted.state;
          const code = STATE_CODES[extracted.state.toLowerCase()];
          if (code && !job.stateCode) {
            updateData.stateCode = code;
          }
          stats.stateUpdated++;
          fieldsUpdated++;
        }

        // Experience Level
        if (extracted.experience_level && !job.experienceLevel) {
          updateData.experienceLevel = extracted.experience_level;
          stats.expLevelUpdated++;
          fieldsUpdated++;
        }

        // Clinical Setting
        if (extracted.clinical_setting && !job.setting) {
          updateData.setting = extracted.clinical_setting;
          stats.settingUpdated++;
          fieldsUpdated++;
        }

        // Patient Population
        if (extracted.patient_population && !job.population) {
          updateData.population = extracted.patient_population;
          stats.populationUpdated++;
          fieldsUpdated++;
        }

        // Benefits
        if (extracted.benefits && Array.isArray(extracted.benefits) && extracted.benefits.length > 0 && (!job.benefits || job.benefits.length === 0)) {
          updateData.benefits = extracted.benefits;
          stats.benefitsUpdated++;
          fieldsUpdated++;
        }

        if (fieldsUpdated > 0) stats.enriched++;

        // Execute update (always writes lastEnrichedAt)
        try {
          await prisma.job.update({
            where: { id: job.id },
            data: updateData,
          });
        } catch {
          stats.errors++;
        }
      }

      // Rate limit
      if (i + BATCH_SIZE < jobs.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const estimatedCost = (
      (stats.totalInputTokens / 1_000_000) * INPUT_COST_PER_1M +
      (stats.totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_1M
    ).toFixed(4);

    const summary = {
      processed: stats.processed,
      enriched: stats.enriched,
      noDataFound: stats.noData,
      errors: stats.errors,
      fieldsUpdated: {
        salary: stats.salaryUpdated,
        jobType: stats.jobTypeUpdated,
        mode: stats.modeUpdated,
        city: stats.cityUpdated,
        state: stats.stateUpdated,
        setting: stats.settingUpdated,
        population: stats.populationUpdated,
        experienceLevel: stats.expLevelUpdated,
        benefits: stats.benefitsUpdated,
      },
      gptUsage: {
        model: 'gpt-4o-mini',
        inputTokens: stats.totalInputTokens,
        outputTokens: stats.totalOutputTokens,
        totalTokens: stats.totalInputTokens + stats.totalOutputTokens,
        estimatedCostUSD: `$${estimatedCost}`,
      },
      elapsedSeconds: elapsed,
    };

    console.log('[Enrich Jobs] Complete:', JSON.stringify(summary, null, 2));

    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('[Enrich Jobs] Fatal error:', error);
    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 });
  }
}
