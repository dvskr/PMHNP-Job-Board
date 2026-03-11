import { describe, it, expect } from 'vitest';
import { extractSalary, detectJobType, validateAndNormalizeSalary } from '../../lib/job-normalizer';

describe('extractSalary — Hourly rates', () => {
    it('matches "$55/hour"', () => {
        const r = extractSalary('Compensation: $55/hour');
        expect(r.min).toBe(55);
        expect(r.period).toBe('hour');
    });

    it('matches "$45 - $65 per hour"', () => {
        const r = extractSalary('Pay range: $45 - $65 per hour');
        expect(r.min).toBe(45);
        expect(r.max).toBe(65);
        expect(r.period).toBe('hour');
    });

    it('matches "$50/hr"', () => {
        const r = extractSalary('$50/hr plus benefits');
        expect(r.min).toBe(50);
        expect(r.period).toBe('hour');
    });

    it('matches "$42.50 per hour"', () => {
        const r = extractSalary('Starting at $42.50 per hour');
        expect(r.min).toBe(42.50);
        expect(r.period).toBe('hour');
    });
});

describe('extractSalary — Annual salaries', () => {
    it('matches "$120,000/year"', () => {
        const r = extractSalary('Salary: $120,000/year');
        expect(r.min).toBe(120000);
        expect(r.period).toBe('year');
    });

    it('matches "$100k - $150k annually"', () => {
        const r = extractSalary('Earn $100k - $150k annually');
        expect(r.min).toBe(100000);
        expect(r.max).toBe(150000);
        expect(r.period).toBe('year');
    });

    it('matches "$120,000 per annum"', () => {
        const r = extractSalary('$120,000 per annum with benefits');
        expect(r.min).toBe(120000);
        expect(r.period).toBe('year');
    });
});

describe('extractSalary — Monthly/Weekly/Daily', () => {
    it('matches "$8,000/month"', () => {
        const r = extractSalary('We offer $8,000/month');
        expect(r.min).toBe(8000);
        expect(r.period).toBe('month');
    });

    it('matches "$2,000 per week"', () => {
        const r = extractSalary('$2,000 per week locum position');
        expect(r.min).toBe(2000);
        expect(r.period).toBe('week');
    });

    it('matches "$500 - $680 per day"', () => {
        const r = extractSalary('Per diem rate: $500 - $680 per day');
        expect(r.min).toBe(500);
        expect(r.max).toBe(680);
        expect(r.period).toBe('day');
    });
});

describe('extractSalary — Context-based salaries', () => {
    it('matches "Salary: $130,000"', () => {
        const r = extractSalary('Salary: $130,000 plus benefits');
        expect(r.min).toBe(130000);
        expect(r.period).toBe('year');
    });

    it('matches "compensation: $120k-$140k"', () => {
        const r = extractSalary('Total compensation: $120k-$140k');
        expect(r.min).toBe(120000);
        expect(r.max).toBe(140000);
        expect(r.period).toBe('year');
    });
});

describe('extractSalary — False positive filtering', () => {
    it('rejects sign-on bonus amounts', () => {
        const r = extractSalary('$10,000 sign-on bonus');
        expect(r.min).toBeNull();
    });

    it('rejects funding amounts', () => {
        const r = extractSalary('Company raised $50,000,000 in Series B funding');
        expect(r.min).toBeNull();
    });

    it('rejects insurance deductible amounts', () => {
        const r = extractSalary('Malpractice insurance: $1,000 - $3,000 deductible');
        expect(r.min).toBeNull();
    });

    it('returns null for no salary text', () => {
        const r = extractSalary('We are looking for a PMHNP to join our team.');
        expect(r.min).toBeNull();
        expect(r.max).toBeNull();
        expect(r.period).toBeNull();
    });
});

describe('extractSalary — Edge cases', () => {
    it('handles empty string', () => {
        const r = extractSalary('');
        expect(r.min).toBeNull();
    });

    it('handles dollar amounts with K suffix', () => {
        const r = extractSalary('Salary $120k per year');
        expect(r.min).toBe(120000);
        expect(r.period).toBe('year');
    });

    it('handles em dash separator', () => {
        const r = extractSalary('$100,000—$150,000 per year');
        expect(r.min).toBe(100000);
        expect(r.max).toBe(150000);
        expect(r.period).toBe('year');
    });

    it('handles "to" separator', () => {
        const r = extractSalary('$55 to $75 per hour');
        expect(r.min).toBe(55);
        expect(r.max).toBe(75);
        expect(r.period).toBe('hour');
    });
});

describe('detectJobType', () => {
    it('detects Full-Time', () => {
        expect(detectJobType('Full-time position available')).toBe('Full-Time');
    });

    it('detects Part-Time', () => {
        expect(detectJobType('Part-time PMHNP needed')).toBe('Part-Time');
    });

    it('detects Contract', () => {
        expect(detectJobType('Contract position for 6 months')).toBe('Contract');
    });

    it('detects Per Diem', () => {
        expect(detectJobType('Per diem PMHNP shifts available')).toBe('Per Diem');
    });

    it('detects permanent as Full-Time', () => {
        expect(detectJobType('Permanent psychiatric NP position')).toBe('Full-Time');
    });

    it('returns null for unknown', () => {
        expect(detectJobType('PMHNP position available')).toBeNull();
    });
});

describe('validateAndNormalizeSalary', () => {
    it('normalizes hourly to reasonable bounds', () => {
        const r = validateAndNormalizeSalary(55, 75, 'hourly rate', 'PMHNP', 'hour');
        expect(r.minSalary).toBe(55);
        expect(r.maxSalary).toBe(75);
        expect(r.salaryPeriod).toBe('hourly');
    });

    it('rejects impossibly high hourly rate', () => {
        const r = validateAndNormalizeSalary(500, null, 'hourly', 'PMHNP', 'hour');
        expect(r.minSalary).toBeNull(); // $500/hr is suspicious
    });

    it('rejects impossibly low annual salary', () => {
        const r = validateAndNormalizeSalary(10000, null, 'annual', 'PMHNP', 'year');
        expect(r.minSalary).toBeNull(); // $10k/year is not real
    });

    it('swaps min/max if reversed', () => {
        const r = validateAndNormalizeSalary(150000, 100000, 'annual', 'PMHNP Salary', 'year');
        expect(r.minSalary).toBe(100000);
        expect(r.maxSalary).toBe(150000);
    });

    it('handles null inputs', () => {
        const r = validateAndNormalizeSalary(null, null, '', 'PMHNP', null);
        expect(r.minSalary).toBeNull();
        expect(r.maxSalary).toBeNull();
        expect(r.salaryPeriod).toBeNull();
    });
});
