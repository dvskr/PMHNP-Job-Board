/**
 * Bulk Re-Enrichment Script — gpt-5-mini
 * 
 * Re-enriches ALL published jobs with missing fields using gpt-5-mini.
 * Runs locally against the production DB with concurrency control.
 * 
 * Usage: node scripts/bulk-enrich.mjs
 */
import pg from 'pg';
import OpenAI from 'openai';

const { Client } = pg;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DB_URL = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!OPENAI_API_KEY || !DB_URL) {
  console.error('Missing required env vars: OPENAI_API_KEY, DATABASE_URL');
  process.exit(1);
}

const CONCURRENCY = 5;       // 5 parallel LLM calls
const BATCH_DELAY_MS = 500;  // Pause between batches
const MIN_DESC_LENGTH = 100; // Skip jobs with tiny descriptions

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const STATE_CODES = {
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

const SYSTEM_PROMPT = `You extract structured job posting data. Return JSON with ONLY fields you can CONFIDENTLY find. Never guess or fabricate.

Fields:
- salary_min: number, minimum annual salary in USD. Convert: hourly×2080, monthly×12, weekly×52
- salary_max: number, maximum annual salary in USD
- salary_period: "hour", "month", or "year" (original unit BEFORE conversion)
- job_type: "Full-Time", "Part-Time", "Contract", "Per Diem", or "PRN"
- work_mode: EXACTLY ONE of "Remote", "Hybrid", "In-Person" (use these strings verbatim — do NOT use "On-site", "Onsite", "Telehealth", or other variants; map "Telehealth" to "Remote" and "On-site"/"Onsite" to "In-Person")
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

async function extractWithLLM(description, title, employer, location) {
  try {
    const truncated = description.substring(0, 2500);
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Title: ${title}\nEmployer: ${employer}\nLocation: ${location}\n\n${truncated}` }
      ],
      max_completion_tokens: 4096,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const content = response.choices[0]?.message?.content;
    if (!content) return { result: null, inputTokens, outputTokens };

    const parsed = JSON.parse(content);
    if (parsed.salary_min && (parsed.salary_min < 40000 || parsed.salary_min > 500000)) {
      delete parsed.salary_min;
      delete parsed.salary_max;
      delete parsed.salary_period;
    }
    return { result: Object.keys(parsed).length > 0 ? parsed : null, inputTokens, outputTokens };
  } catch (err) {
    return { result: null, inputTokens: 0, outputTokens: 0, error: err.message };
  }
}

// Resilient DB connection with keep-alive and auto-reconnect
let db;
async function connectDB() {
  db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  db.on('error', (err) => console.error('  ⚠️ DB connection error (will reconnect):', err.message));
  await db.connect();
}
async function dbQuery(sql, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.query(sql, params);
    } catch (err) {
      if (attempt < 2 && (err.message.includes('Connection terminated') || err.message.includes('connection'))) {
        console.log('  🔄 Reconnecting to DB...');
        try { await db.end(); } catch (_) {}
        await connectDB();
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  await connectDB();

  // Keep-alive: ping every 60s to prevent Supabase timeout
  const keepAlive = setInterval(async () => {
    try { await db.query('SELECT 1'); } catch (_) {}
  }, 60000);

  console.log('\n══════════════════════════════════════════════');
  console.log('  BULK RE-ENRICHMENT — gpt-5-mini');
  console.log('══════════════════════════════════════════════\n');

  // Fetch all published jobs with at least one missing field
  const { rows: jobs } = await dbQuery(`
    SELECT id, title, employer, location, description,
           normalized_min_salary, normalized_max_salary,
           job_type, mode, city, state, state_code,
           is_remote, is_hybrid,
           experience_level, clinical_setting, patient_population, benefits
    FROM jobs
    WHERE is_published = true
    AND LENGTH(description) >= ${MIN_DESC_LENGTH}
    AND (
      normalized_min_salary IS NULL OR
      mode IS NULL OR
      job_type IS NULL OR
      city IS NULL OR
      state IS NULL OR
      experience_level IS NULL OR
      clinical_setting IS NULL OR
      patient_population IS NULL
    )
    ORDER BY created_at DESC
  `);

  console.log(`Found ${jobs.length} jobs needing enrichment\n`);

  const stats = {
    processed: 0, enriched: 0, errors: 0, noData: 0, skipped: 0,
    salaryUpdated: 0, modeUpdated: 0, jobTypeUpdated: 0,
    cityUpdated: 0, stateUpdated: 0, settingUpdated: 0,
    populationUpdated: 0, expLevelUpdated: 0, benefitsUpdated: 0,
    totalInputTokens: 0, totalOutputTokens: 0,
  };

  const startTime = Date.now();
  let lastProgressTime = startTime;

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (job) => {
        const { result, inputTokens, outputTokens, error } = await extractWithLLM(
          job.description, job.title, job.employer, job.location || ''
        );
        return { job, result, inputTokens, outputTokens, error };
      })
    );

    for (const r of results) {
      stats.processed++;
      if (r.status === 'rejected') { stats.errors++; continue; }
      const { job, result: extracted, inputTokens, outputTokens, error } = r.value;

      stats.totalInputTokens += inputTokens;
      stats.totalOutputTokens += outputTokens;

      if (error) { stats.errors++; continue; }

      if (!extracted) {
        stats.noData++;
        // Still mark as enriched
        await dbQuery(`UPDATE jobs SET last_enriched_at = NOW() WHERE id = $1`, [job.id]);
        continue;
      }

      const updates = [];
      const values = [];
      let paramIdx = 1;

      // Salary
      if (extracted.salary_min && !job.normalized_min_salary) {
        const min = Math.round(extracted.salary_min);
        const max = Math.round(extracted.salary_max || extracted.salary_min);
        updates.push(`normalized_min_salary = $${paramIdx++}`); values.push(min);
        updates.push(`normalized_max_salary = $${paramIdx++}`); values.push(max);
        updates.push(`min_salary = $${paramIdx++}`); values.push(min);
        updates.push(`max_salary = $${paramIdx++}`); values.push(max);
        updates.push(`salary_is_estimated = true`);
        updates.push(`salary_confidence = 0.7`);
        if (extracted.salary_period) {
          updates.push(`salary_period = $${paramIdx++}`); values.push(extracted.salary_period);
        }
        const dispMin = `$${Math.round(min / 1000)}k`;
        const dispMax = `$${Math.round(max / 1000)}k`;
        updates.push(`display_salary = $${paramIdx++}`); values.push(`${dispMin} - ${dispMax}/yr`);
        stats.salaryUpdated++;
      }

      // Job Type
      if (extracted.job_type && !job.job_type) {
        updates.push(`job_type = $${paramIdx++}`); values.push(extracted.job_type);
        stats.jobTypeUpdated++;
      }

      // Work Mode
      if (extracted.work_mode && !job.mode) {
        const raw = extracted.work_mode.trim();
        const canon = raw === 'Telehealth' ? 'Remote'
          : (raw === 'On-site' || raw === 'Onsite') ? 'In-Person'
          : (raw === 'Remote' || raw === 'Hybrid' || raw === 'In-Person') ? raw
          : null;
        if (canon) {
          updates.push(`mode = $${paramIdx++}`); values.push(canon);
          if (canon === 'Remote') updates.push(`is_remote = true`);
          if (canon === 'Hybrid') updates.push(`is_hybrid = true`);
          stats.modeUpdated++;
        }
      }

      // City
      if (extracted.city && !job.city) {
        updates.push(`city = $${paramIdx++}`); values.push(extracted.city);
        stats.cityUpdated++;
      }

      // State
      if (extracted.state && !job.state) {
        updates.push(`state = $${paramIdx++}`); values.push(extracted.state);
        const code = STATE_CODES[extracted.state.toLowerCase()];
        if (code && !job.state_code) {
          updates.push(`state_code = $${paramIdx++}`); values.push(code);
        }
        stats.stateUpdated++;
      }

      // Experience Level
      if (extracted.experience_level && !job.experience_level) {
        updates.push(`experience_level = $${paramIdx++}`); values.push(extracted.experience_level);
        stats.expLevelUpdated++;
      }

      // Clinical Setting
      if (extracted.clinical_setting && !job.clinical_setting) {
        updates.push(`clinical_setting = $${paramIdx++}`); values.push(extracted.clinical_setting);
        stats.settingUpdated++;
      }

      // Patient Population
      if (extracted.patient_population && !job.patient_population) {
        updates.push(`patient_population = $${paramIdx++}`); values.push(extracted.patient_population);
        stats.populationUpdated++;
      }

      // Benefits — Postgres text[] needs {val1,val2} format, not JSON
      if (extracted.benefits && Array.isArray(extracted.benefits) && extracted.benefits.length > 0 && (!job.benefits || job.benefits.length === 0)) {
        const pgArray = `{${extracted.benefits.map(b => `"${b.replace(/"/g, '\\"')}"`).join(',')}}`;
        updates.push(`benefits = $${paramIdx++}`); values.push(pgArray);
        stats.benefitsUpdated++;
      }

      // Always update last_enriched_at
      updates.push(`last_enriched_at = NOW()`);

      if (updates.length > 1) stats.enriched++; // More than just last_enriched_at

      values.push(job.id);
      const sql = `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${paramIdx}`;

      try {
        await dbQuery(sql, values);
      } catch (err) {
        console.error(`  DB error for ${job.id}: ${err.message}`);
        stats.errors++;
      }
    }

    // Progress log every 30 seconds
    const now = Date.now();
    if (now - lastProgressTime > 30000 || i + CONCURRENCY >= jobs.length) {
      const elapsed = ((now - startTime) / 1000).toFixed(0);
      const pct = Math.round(stats.processed / jobs.length * 100);
      const eta = stats.processed > 0 ? Math.round((now - startTime) / stats.processed * (jobs.length - stats.processed) / 1000) : '?';
      console.log(`  [${elapsed}s] ${stats.processed}/${jobs.length} (${pct}%) | Enriched: ${stats.enriched} | Errors: ${stats.errors} | ETA: ${eta}s`);
      lastProgressTime = now;
    }

    // Rate limit
    if (i + CONCURRENCY < jobs.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const costInput = (stats.totalInputTokens / 1_000_000) * 0.30;
  const costOutput = (stats.totalOutputTokens / 1_000_000) * 1.25;

  console.log('\n══════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('══════════════════════════════════════════════\n');
  console.log(`  Total processed: ${stats.processed}`);
  console.log(`  Enriched: ${stats.enriched}`);
  console.log(`  No data found: ${stats.noData}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log(`\n  Fields updated:`);
  console.log(`    Salary: ${stats.salaryUpdated}`);
  console.log(`    Mode: ${stats.modeUpdated}`);
  console.log(`    Job Type: ${stats.jobTypeUpdated}`);
  console.log(`    City: ${stats.cityUpdated}`);
  console.log(`    State: ${stats.stateUpdated}`);
  console.log(`    Setting: ${stats.settingUpdated}`);
  console.log(`    Population: ${stats.populationUpdated}`);
  console.log(`    Exp Level: ${stats.expLevelUpdated}`);
  console.log(`    Benefits: ${stats.benefitsUpdated}`);
  console.log(`\n  Token usage:`);
  console.log(`    Input: ${stats.totalInputTokens.toLocaleString()}`);
  console.log(`    Output: ${stats.totalOutputTokens.toLocaleString()}`);
  console.log(`    Cost: $${(costInput + costOutput).toFixed(2)} (input: $${costInput.toFixed(2)}, output: $${costOutput.toFixed(2)})`);
  console.log(`\n  Elapsed: ${elapsed}s`);

  clearInterval(keepAlive);
  await db.end();
}

main().catch(console.error);
