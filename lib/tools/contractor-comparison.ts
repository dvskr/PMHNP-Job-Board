/**
 * 1099 vs W-2 take-home comparison for PMHNPs — pure calculation module.
 *
 * Tax year 2025. Every year-specific constant lives in TAX_CONSTANTS_2025
 * with a source comment; nothing here fetches data or touches the DOM.
 *
 * DELIBERATE SCOPE LIMIT — no federal or state income tax brackets:
 * both a W-2 employee and a 1099 contractor owe ordinary income tax on
 * their earnings, so bracket math largely cancels out of the comparison.
 * The decision-relevant differential is (a) payroll tax — the contractor
 * pays both halves via self-employment tax while the employee pays only
 * the 7.65% employee share — and (b) employer-paid benefits the
 * contractor must self-fund. The UI restates this limitation verbatim.
 */

export const TAX_CONSTANTS_2025 = {
  /**
   * Portion of net self-employment profit subject to SE tax.
   * Source: IRS Schedule SE (Form 1040), line 4a — net profit × 92.35%.
   */
  SE_NET_EARNINGS_FACTOR: 0.9235,

  /** Social Security (OASDI) share of SE tax — 12.4%. Source: IRS Schedule SE. */
  SE_SOCIAL_SECURITY_RATE: 0.124,

  /**
   * Medicare share of SE tax — 2.9%, uncapped. Source: IRS Schedule SE.
   * NOTE: the 0.9% Additional Medicare Tax on earnings above $200,000
   * (single filer) is deliberately ignored here — it applies identically
   * to high W-2 wages and high SE earnings, so it washes out of a
   * side-by-side comparison at the same income level.
   */
  SE_MEDICARE_RATE: 0.029,

  /**
   * 2025 Social Security wage base: the 12.4% OASDI portion applies only
   * to the first $176,100 of net SE earnings (or W-2 wages).
   * Source: SSA 2025 COLA fact sheet (announced October 2024).
   */
  SOCIAL_SECURITY_WAGE_BASE: 176100,

  /** Employee share of Social Security withheld from W-2 wages — 6.2% (half of 12.4%). */
  EMPLOYEE_SOCIAL_SECURITY_RATE: 0.062,

  /** Employee share of Medicare withheld from W-2 wages — 1.45% (half of 2.9%). */
  EMPLOYEE_MEDICARE_RATE: 0.0145,

  /**
   * Working days per year used to value PTO: 52 weeks × 5 days.
   * A payroll convention, not tax law — kept here so every consumer of
   * this module values a PTO day identically.
   */
  WORKDAYS_PER_YEAR: 260,
} as const;

/* ── Input shapes ─────────────────────────────────────────────────── */

export interface W2PackageInput {
  /** Annual base salary in dollars. */
  annualSalary: number;
  /** Employer 401(k) match as a percent of salary (e.g. 4 means 4%). */
  employer401kMatchPercent: number;
  /** Employer-paid health insurance premium, dollars per month. */
  employerHealthInsuranceMonthly: number;
  /** Paid time off in days, valued at the salary's daily rate. */
  ptoDays: number;
}

export interface ContractorPackageInput {
  hourlyRate: number;
  hoursPerWeek: number;
  weeksPerYear: number;
}

/* ── Output shapes ────────────────────────────────────────────────── */

export interface SelfEmploymentTaxBreakdown {
  /** Gross SE income × 92.35% — the SE tax base. */
  netEarningsFromSelfEmployment: number;
  /** 12.4% of net earnings, capped at the SS wage base. */
  socialSecurityTax: number;
  /** 2.9% of net earnings, uncapped. */
  medicareTax: number;
  totalTax: number;
  /**
   * Half of the SE tax is deductible against income-tax taxable income
   * (IRS Schedule SE Part I, line 13). It does NOT feed back into the SE
   * tax base itself — this field is informational; its dollar value to
   * you depends on your marginal bracket, which this module excludes.
   */
  deductibleHalf: number;
}

export interface EmployeeFicaBreakdown {
  socialSecurityTax: number;
  medicareTax: number;
  totalTax: number;
}

export interface W2Summary {
  grossSalary: number;
  employer401kMatchValue: number;
  employerHealthInsuranceValue: number;
  ptoValue: number;
  /** Sum of the three employer-benefit line items above. */
  totalBenefitsValue: number;
  /** Employee share of FICA withheld from wages (6.2% capped + 1.45%). */
  employeeFicaTax: number;
  /** grossSalary + totalBenefitsValue − employeeFicaTax. Pre-income-tax. */
  effectiveValue: number;
}

export interface ContractorSummary {
  grossIncome: number;
  selfEmploymentTax: SelfEmploymentTaxBreakdown;
  /** grossIncome − selfEmploymentTax.totalTax. Pre-income-tax. */
  effectiveValue: number;
}

export interface ComparisonResult {
  w2: W2Summary;
  contractor: ContractorSummary;
  /** contractor.effectiveValue − w2.effectiveValue (positive → 1099 ahead). */
  differential: number;
  advantage: 'w2' | 'contractor' | 'even';
  /** 1099 hourly rate that would exactly match the W-2 package's effective value. */
  breakEvenHourlyRate: number;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Treat NaN, Infinity, and negatives as 0 so UI edge inputs never propagate. */
function toNonNegativeFinite(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Two effective values within $1/year are a wash, not a winner. */
const EVEN_THRESHOLD_DOLLARS = 1;

/* ── Calculations ─────────────────────────────────────────────────── */

/**
 * Self-employment tax on gross 1099 income (before expenses).
 * The deductible half reduces income-tax taxable income only — it is
 * intentionally NOT subtracted from the SE tax base here.
 */
export function calculateSelfEmploymentTax(grossSelfEmploymentIncome: number): SelfEmploymentTaxBreakdown {
  const {
    SE_NET_EARNINGS_FACTOR,
    SE_SOCIAL_SECURITY_RATE,
    SE_MEDICARE_RATE,
    SOCIAL_SECURITY_WAGE_BASE,
  } = TAX_CONSTANTS_2025;

  const gross = toNonNegativeFinite(grossSelfEmploymentIncome);
  const netEarnings = gross * SE_NET_EARNINGS_FACTOR;
  const socialSecurityTax = Math.min(netEarnings, SOCIAL_SECURITY_WAGE_BASE) * SE_SOCIAL_SECURITY_RATE;
  const medicareTax = netEarnings * SE_MEDICARE_RATE;
  const totalTax = socialSecurityTax + medicareTax;

  return {
    netEarningsFromSelfEmployment: netEarnings,
    socialSecurityTax,
    medicareTax,
    totalTax,
    deductibleHalf: totalTax / 2,
  };
}

/** Employee share of FICA on W-2 wages: 6.2% up to the wage base + 1.45% uncapped. */
export function calculateEmployeeFica(annualWages: number): EmployeeFicaBreakdown {
  const {
    EMPLOYEE_SOCIAL_SECURITY_RATE,
    EMPLOYEE_MEDICARE_RATE,
    SOCIAL_SECURITY_WAGE_BASE,
  } = TAX_CONSTANTS_2025;

  const wages = toNonNegativeFinite(annualWages);
  const socialSecurityTax = Math.min(wages, SOCIAL_SECURITY_WAGE_BASE) * EMPLOYEE_SOCIAL_SECURITY_RATE;
  const medicareTax = wages * EMPLOYEE_MEDICARE_RATE;

  return { socialSecurityTax, medicareTax, totalTax: socialSecurityTax + medicareTax };
}

/** Value the W-2 package: salary plus employer benefits minus the employee FICA share. */
export function summarizeW2Package(pkg: W2PackageInput): W2Summary {
  const { WORKDAYS_PER_YEAR } = TAX_CONSTANTS_2025;

  const grossSalary = toNonNegativeFinite(pkg.annualSalary);
  const matchPercent = toNonNegativeFinite(pkg.employer401kMatchPercent);
  const healthMonthly = toNonNegativeFinite(pkg.employerHealthInsuranceMonthly);
  const ptoDays = toNonNegativeFinite(pkg.ptoDays);

  const employer401kMatchValue = grossSalary * (matchPercent / 100);
  const employerHealthInsuranceValue = healthMonthly * 12;
  const ptoValue = (grossSalary / WORKDAYS_PER_YEAR) * ptoDays;
  const totalBenefitsValue = employer401kMatchValue + employerHealthInsuranceValue + ptoValue;
  const employeeFicaTax = calculateEmployeeFica(grossSalary).totalTax;

  return {
    grossSalary,
    employer401kMatchValue,
    employerHealthInsuranceValue,
    ptoValue,
    totalBenefitsValue,
    employeeFicaTax,
    effectiveValue: grossSalary + totalBenefitsValue - employeeFicaTax,
  };
}

/** Annual gross from an hourly 1099 engagement. */
export function contractorAnnualGross(pkg: ContractorPackageInput): number {
  return (
    toNonNegativeFinite(pkg.hourlyRate) *
    toNonNegativeFinite(pkg.hoursPerWeek) *
    toNonNegativeFinite(pkg.weeksPerYear)
  );
}

/** Value a 1099 package expressed as an annual gross figure directly. */
export function summarizeContractorGross(annualGross: number): ContractorSummary {
  const grossIncome = toNonNegativeFinite(annualGross);
  const selfEmploymentTax = calculateSelfEmploymentTax(grossIncome);

  return {
    grossIncome,
    selfEmploymentTax,
    effectiveValue: grossIncome - selfEmploymentTax.totalTax,
  };
}

/** Value a 1099 package expressed as rate × hours × weeks. */
export function summarizeContractorPackage(pkg: ContractorPackageInput): ContractorSummary {
  return summarizeContractorGross(contractorAnnualGross(pkg));
}

/**
 * Gross 1099 income whose post-SE-tax value equals `targetEffectiveValue`.
 * Closed-form and piecewise because SE tax is linear on either side of the
 * SS wage-base cap: solve the uncapped regime first; if the implied net
 * earnings exceed the cap, re-solve with Social Security frozen at the cap.
 */
function breakEvenGrossIncome(targetEffectiveValue: number): number {
  const {
    SE_NET_EARNINGS_FACTOR,
    SE_SOCIAL_SECURITY_RATE,
    SE_MEDICARE_RATE,
    SOCIAL_SECURITY_WAGE_BASE,
  } = TAX_CONSTANTS_2025;

  const target = toNonNegativeFinite(targetEffectiveValue);
  const combinedRate = SE_SOCIAL_SECURITY_RATE + SE_MEDICARE_RATE;

  // Regime 1 — below the cap: G − G·factor·15.3% = target
  const uncappedGross = target / (1 - combinedRate * SE_NET_EARNINGS_FACTOR);
  if (uncappedGross * SE_NET_EARNINGS_FACTOR <= SOCIAL_SECURITY_WAGE_BASE) {
    return uncappedGross;
  }

  // Regime 2 — above the cap: G − (cap·12.4% + G·factor·2.9%) = target
  const socialSecurityAtCap = SOCIAL_SECURITY_WAGE_BASE * SE_SOCIAL_SECURITY_RATE;
  return (target + socialSecurityAtCap) / (1 - SE_MEDICARE_RATE * SE_NET_EARNINGS_FACTOR);
}

/**
 * The 1099 hourly rate needed to match a W-2 package's effective value,
 * given the hours/week and weeks/year the contractor would actually work.
 * Returns 0 when annual hours are 0 (never NaN/Infinity).
 */
export function breakEvenHourlyRate(
  w2Package: W2PackageInput,
  hoursPerWeek: number,
  weeksPerYear: number,
): number {
  const annualHours = toNonNegativeFinite(hoursPerWeek) * toNonNegativeFinite(weeksPerYear);
  if (annualHours === 0) return 0;

  const targetEffectiveValue = summarizeW2Package(w2Package).effectiveValue;
  return breakEvenGrossIncome(targetEffectiveValue) / annualHours;
}

/** Full side-by-side comparison of a W-2 package and a 1099 engagement. */
export function compareW2VsContractor(
  w2Package: W2PackageInput,
  contractorPackage: ContractorPackageInput,
): ComparisonResult {
  const w2 = summarizeW2Package(w2Package);
  const contractor = summarizeContractorPackage(contractorPackage);
  const differential = contractor.effectiveValue - w2.effectiveValue;

  const advantage: ComparisonResult['advantage'] =
    Math.abs(differential) < EVEN_THRESHOLD_DOLLARS
      ? 'even'
      : differential > 0
        ? 'contractor'
        : 'w2';

  return {
    w2,
    contractor,
    differential,
    advantage,
    breakEvenHourlyRate: breakEvenHourlyRate(
      w2Package,
      contractorPackage.hoursPerWeek,
      contractorPackage.weeksPerYear,
    ),
  };
}
