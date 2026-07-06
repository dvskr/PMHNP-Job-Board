/**
 * Salary Bounds — single source of truth for every salary threshold
 * used across the pipeline.
 *
 * IMPORTANT: the four stage groups below intentionally hold DIFFERENT
 * values today. They were centralized here as-is (zero behavior change)
 * so the divergence is at least visible in one place. Each group governs
 * a different pipeline stage:
 *
 *   INGEST_PERIOD_BOUNDS      → lib/job-normalizer.ts
 *                               (validateAndNormalizeSalary — per-period
 *                               clamping of raw source values at ingest)
 *   NORMALIZER_BAND           → lib/salary-normalizer.ts
 *                               (annual-equivalent normalization +
 *                               confidence-band clamping)
 *   MAINTENANCE_SCRIPT_BOUNDS → lib/salary-utils.ts
 *                               (store-both processing, consumed by
 *                               scripts/fix-all-salaries.ts)
 *   ENRICHMENT_BOUNDS         → lib/llm-enrichment.ts
 *                               (LLM prompt text + post-parse validation)
 *
 * Any future unification of these values happens in THIS file, not in
 * the consumers.
 */

// Clamp tolerance shared by stages 1 and 2 (policy 2026-07-06, audit #13).
// No value is ever adjusted UPWARD (that fabricates — a $38k posting used
// to display as "$64k/yr"). Below a band floor → dropped. Above a band cap
// within this tolerance → clamped DOWN to the cap; further above → dropped.
export const CLAMP_TOLERANCE = 0.15;

// ── Stage 1: ingest-time per-period clamping (lib/job-normalizer.ts) ──
// Drop-below-floor / bounded clamp-down above cap (see CLAMP_TOLERANCE).
// hourly.max harmonized 300 → 350 on 2026-07-06 to match
// NORMALIZER_BAND.contractorHourlyMax — the mismatch dropped legitimate
// $301-$350/hr contractor rates at ingest that stage 2 explicitly allows.
// monthly: labeled-monthly values ≥ $20k are reinterpreted as ANNUAL before
// these bounds apply (see the overrides in both normalizers), so the
// monthly band effectively governs true sub-$20k monthly figures only.
export const INGEST_PERIOD_BOUNDS: Record<string, { min: number; max: number }> = {
  hourly:    { min: 20,    max: 350 },
  annual:    { min: 30000, max: 500000 },
  daily:     { min: 100,   max: 2000 },
  weekly:    { min: 400,   max: 10000 },
  biweekly:  { min: 800,   max: 20000 },
  monthly:   { min: 2000,  max: 40000 },
};

// ── Stage 2: annual normalization band (lib/salary-normalizer.ts) ──
export const NORMALIZER_BAND = {
  annualMin: 80000,           // Minimum reasonable annual salary
  annualMax: 350000,          // Maximum reasonable W-2 annual salary (PMHNP in HCOL areas)
  contractorHourlyMin: 50,    // $50/hour minimum for contractor PMHNP
  contractorHourlyMax: 350,   // $350/hour maximum (high-end contractors)
  // Annual clamp caps by confidence band. Raised 2026-05-05 from $400k —
  // locum / 1099 PMHNP roles in HCOL markets legitimately reach $450k–$500k+.
  clampCapHighConfidence: 550000,
  clampCapLowConfidence: 600000,
  // Floor = annualMin × multiplier ($64k high-confidence, $48k low-confidence).
  floorMultiplierHighConfidence: 0.8,
  floorMultiplierLowConfidence: 0.6,
} as const;

// ── Stage 3: store-both processing (lib/salary-utils.ts) ──
export const MAINTENANCE_SCRIPT_BOUNDS = {
  // Hourly rates (PMHNP contractors typically $100-$300/hr)
  MIN_HOURLY: 25,
  MAX_HOURLY: 400,

  // Annual salaries
  MIN_ANNUAL: 40000,
  MAX_ANNUAL: 400000,

  // Daily rates (typically $500-$3000 for PMHNP)
  MIN_DAILY: 200,
  MAX_DAILY: 5000,
} as const;

// ── Stage 4: LLM enrichment validation (lib/llm-enrichment.ts) ──
// Interpolated into the extraction prompt AND enforced in code so the
// two can never diverge.
export const ENRICHMENT_BOUNDS = {
  annualMin: 40000,
  annualMax: 500000,
} as const;
