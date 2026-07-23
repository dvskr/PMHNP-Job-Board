/**
 * lib/tools/contractor-comparison.ts — 1099 vs W-2 math (tax year 2025).
 *
 * Hand-computed anchors (IRS Schedule SE method):
 *   $100,000 gross SE → net 92,350 → SS 11,451.40 + Medicare 2,678.15
 *     = 14,129.55 total (15.3% of 92.35%).
 *   $250,000 gross SE → net 230,875 → SS capped at 176,100 × 12.4%
 *     = 21,836.40; Medicare 230,875 × 2.9% = 6,695.375 → 28,531.775.
 */

import { describe, it, expect } from 'vitest';
import {
    TAX_CONSTANTS_2025,
    calculateSelfEmploymentTax,
    calculateEmployeeFica,
    summarizeW2Package,
    summarizeContractorPackage,
    contractorAnnualGross,
    compareW2VsContractor,
    breakEvenHourlyRate,
    type W2PackageInput,
    type ContractorPackageInput,
} from '@/lib/tools/contractor-comparison';

const {
    SE_NET_EARNINGS_FACTOR,
    SE_SOCIAL_SECURITY_RATE,
    SE_MEDICARE_RATE,
    SOCIAL_SECURITY_WAGE_BASE,
} = TAX_CONSTANTS_2025;

describe('calculateSelfEmploymentTax', () => {
    it('matches the hand-computed IRS Schedule SE example at $100,000', () => {
        // Arrange / Act
        const result = calculateSelfEmploymentTax(100_000);

        // Assert — 92.35% base, 12.4% SS, 2.9% Medicare
        expect(result.netEarningsFromSelfEmployment).toBeCloseTo(92_350, 2);
        expect(result.socialSecurityTax).toBeCloseTo(11_451.4, 2);
        expect(result.medicareTax).toBeCloseTo(2_678.15, 2);
        expect(result.totalTax).toBeCloseTo(14_129.55, 2);
        expect(result.deductibleHalf).toBeCloseTo(7_064.775, 2);
    });

    it('caps the Social Security portion at the 2025 wage base above the cap', () => {
        const result = calculateSelfEmploymentTax(250_000);

        // net earnings 230,875 exceed the 176,100 base → SS frozen at the cap
        expect(result.netEarningsFromSelfEmployment).toBeCloseTo(230_875, 2);
        expect(result.socialSecurityTax).toBeCloseTo(
            SOCIAL_SECURITY_WAGE_BASE * SE_SOCIAL_SECURITY_RATE, // 21,836.40
            2,
        );
        expect(result.medicareTax).toBeCloseTo(6_695.375, 2);
        expect(result.totalTax).toBeCloseTo(28_531.775, 2);

        // Naive uncapped math would overstate the tax
        const uncapped = 250_000 * SE_NET_EARNINGS_FACTOR * (SE_SOCIAL_SECURITY_RATE + SE_MEDICARE_RATE);
        expect(result.totalTax).toBeLessThan(uncapped);
    });

    it('is continuous at the wage-base boundary and flat on SS beyond it', () => {
        const grossAtCap = SOCIAL_SECURITY_WAGE_BASE / SE_NET_EARNINGS_FACTOR;

        const atCap = calculateSelfEmploymentTax(grossAtCap);
        const aboveCap = calculateSelfEmploymentTax(grossAtCap * 1.5);
        const belowCap = calculateSelfEmploymentTax(grossAtCap * 0.9);

        expect(atCap.socialSecurityTax).toBeCloseTo(SOCIAL_SECURITY_WAGE_BASE * SE_SOCIAL_SECURITY_RATE, 2);
        expect(aboveCap.socialSecurityTax).toBeCloseTo(atCap.socialSecurityTax, 2);
        expect(belowCap.socialSecurityTax).toBeLessThan(atCap.socialSecurityTax);
        // Medicare keeps growing uncapped
        expect(aboveCap.medicareTax).toBeGreaterThan(atCap.medicareTax);
    });

    it('does NOT reduce the SE tax base by the deductible half', () => {
        // If the deductible half fed back into the base, total would be less
        // than the straight 15.3% × 92.35% product. It must equal it exactly.
        const result = calculateSelfEmploymentTax(100_000);
        const straightProduct = 100_000 * SE_NET_EARNINGS_FACTOR * (SE_SOCIAL_SECURITY_RATE + SE_MEDICARE_RATE);
        expect(result.totalTax).toBeCloseTo(straightProduct, 6);
    });
});

describe('calculateEmployeeFica', () => {
    it('computes 7.65% employee share below the wage base', () => {
        const result = calculateEmployeeFica(150_000);
        expect(result.socialSecurityTax).toBeCloseTo(9_300, 2);
        expect(result.medicareTax).toBeCloseTo(2_175, 2);
        expect(result.totalTax).toBeCloseTo(11_475, 2);
    });

    it('caps the 6.2% SS share at the wage base', () => {
        const result = calculateEmployeeFica(200_000);
        expect(result.socialSecurityTax).toBeCloseTo(10_918.2, 2); // 176,100 × 6.2%
        expect(result.medicareTax).toBeCloseTo(2_900, 2); // uncapped
        expect(result.totalTax).toBeCloseTo(13_818.2, 2);
    });
});

describe('summarizeW2Package', () => {
    const pkg: W2PackageInput = {
        annualSalary: 150_000,
        employer401kMatchPercent: 4,
        employerHealthInsuranceMonthly: 600,
        ptoDays: 20,
    };

    it('values salary + benefits − employee FICA', () => {
        const summary = summarizeW2Package(pkg);

        expect(summary.grossSalary).toBe(150_000);
        expect(summary.employer401kMatchValue).toBeCloseTo(6_000, 2);
        expect(summary.employerHealthInsuranceValue).toBeCloseTo(7_200, 2);
        expect(summary.ptoValue).toBeCloseTo((150_000 / 260) * 20, 2); // 11,538.46
        expect(summary.totalBenefitsValue).toBeCloseTo(24_738.46, 2);
        expect(summary.employeeFicaTax).toBeCloseTo(11_475, 2);
        expect(summary.effectiveValue).toBeCloseTo(163_263.46, 2);
    });
});

describe('summarizeContractorPackage', () => {
    it('derives annual gross from rate × hours × weeks and subtracts SE tax', () => {
        const pkg: ContractorPackageInput = { hourlyRate: 100, hoursPerWeek: 40, weeksPerYear: 48 };

        expect(contractorAnnualGross(pkg)).toBe(192_000);

        const summary = summarizeContractorPackage(pkg);
        expect(summary.grossIncome).toBe(192_000);
        // net 177,312 > 176,100 → capped SS
        expect(summary.selfEmploymentTax.socialSecurityTax).toBeCloseTo(21_836.4, 2);
        expect(summary.selfEmploymentTax.medicareTax).toBeCloseTo(5_142.048, 2);
        expect(summary.effectiveValue).toBeCloseTo(192_000 - 26_978.448, 2);
        expect(summary.effectiveValue).toBeLessThan(summary.grossIncome);
    });
});

describe('breakEvenHourlyRate', () => {
    it('round-trips below the wage base: feeding the rate back yields an even comparison', () => {
        const w2: W2PackageInput = {
            annualSalary: 90_000,
            employer401kMatchPercent: 3,
            employerHealthInsuranceMonthly: 400,
            ptoDays: 15,
        };
        const rate = breakEvenHourlyRate(w2, 40, 46);
        expect(rate).toBeGreaterThan(0);

        const result = compareW2VsContractor(w2, { hourlyRate: rate, hoursPerWeek: 40, weeksPerYear: 46 });
        expect(result.differential).toBeCloseTo(0, 6);
        expect(result.advantage).toBe('even');
    });

    it('round-trips above the wage base (capped SS regime)', () => {
        const w2: W2PackageInput = {
            annualSalary: 240_000,
            employer401kMatchPercent: 5,
            employerHealthInsuranceMonthly: 800,
            ptoDays: 25,
        };
        const rate = breakEvenHourlyRate(w2, 40, 46);

        // Sanity: the implied gross must actually sit in the capped regime
        const gross = rate * 40 * 46;
        expect(gross * SE_NET_EARNINGS_FACTOR).toBeGreaterThan(SOCIAL_SECURITY_WAGE_BASE);

        const result = compareW2VsContractor(w2, { hourlyRate: rate, hoursPerWeek: 40, weeksPerYear: 46 });
        expect(result.differential).toBeCloseTo(0, 6);
    });

    it('exceeds the naive salary-per-hour rate (SE tax + benefits must be covered)', () => {
        const w2: W2PackageInput = {
            annualSalary: 150_000,
            employer401kMatchPercent: 4,
            employerHealthInsuranceMonthly: 600,
            ptoDays: 20,
        };
        const naiveRate = 150_000 / (40 * 48);
        expect(breakEvenHourlyRate(w2, 40, 48)).toBeGreaterThan(naiveRate);
    });

    it('returns 0 (not NaN/Infinity) when annual hours are zero', () => {
        const w2: W2PackageInput = {
            annualSalary: 150_000,
            employer401kMatchPercent: 4,
            employerHealthInsuranceMonthly: 600,
            ptoDays: 20,
        };
        expect(breakEvenHourlyRate(w2, 0, 48)).toBe(0);
        expect(breakEvenHourlyRate(w2, 40, 0)).toBe(0);
    });
});

describe('zero and degenerate inputs never produce NaN', () => {
    const collectNumbers = (value: unknown): number[] => {
        if (typeof value === 'number') return [value];
        if (value && typeof value === 'object') {
            return Object.values(value).flatMap(collectNumbers);
        }
        return [];
    };

    it('all-zero inputs yield an all-finite, all-zero comparison', () => {
        const result = compareW2VsContractor(
            { annualSalary: 0, employer401kMatchPercent: 0, employerHealthInsuranceMonthly: 0, ptoDays: 0 },
            { hourlyRate: 0, hoursPerWeek: 0, weeksPerYear: 0 },
        );

        for (const n of collectNumbers(result)) {
            expect(Number.isFinite(n)).toBe(true);
        }
        expect(result.w2.effectiveValue).toBe(0);
        expect(result.contractor.effectiveValue).toBe(0);
        expect(result.breakEvenHourlyRate).toBe(0);
        expect(result.advantage).toBe('even');
    });

    it('negative and NaN inputs are clamped to zero', () => {
        const result = compareW2VsContractor(
            { annualSalary: -50_000, employer401kMatchPercent: NaN, employerHealthInsuranceMonthly: -1, ptoDays: NaN },
            { hourlyRate: NaN, hoursPerWeek: -40, weeksPerYear: Infinity },
        );

        for (const n of collectNumbers(result)) {
            expect(Number.isFinite(n)).toBe(true);
        }
        expect(result.w2.grossSalary).toBe(0);
        expect(result.contractor.grossIncome).toBe(0);
    });
});
