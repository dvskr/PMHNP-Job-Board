/**
 * Tests for the regex lead extractor. Persistence is tested separately;
 * this file is pure-function only.
 */
import { describe, it, expect } from 'vitest';
import { mineLeadsFromText } from '@/lib/lead-mining';

describe('mineLeadsFromText — emails', () => {
    it('extracts a real contact email', () => {
        const r = mineLeadsFromText('Email Jane at jane.smith@bigclinic.com to apply.');
        expect(r.emails).toEqual(['jane.smith@bigclinic.com']);
    });

    it('lowercases extracted emails', () => {
        const r = mineLeadsFromText('Send resumes to Recruiter@HealthGroup.ORG');
        expect(r.emails).toEqual(['recruiter@healthgroup.org']);
    });

    it('dedupes within a single text', () => {
        const r = mineLeadsFromText('Contact info@a.com or info@a.com or INFO@a.com');
        expect(r.emails).toEqual(['info@a.com']);
    });

    it('drops noreply / notifications / mailer-daemon addresses', () => {
        const r = mineLeadsFromText('noreply@x.com notifications@y.org real@z.io postmaster@p.com');
        expect(r.emails).toEqual(['real@z.io']);
    });

    it('drops ATS / job-board domains and their subdomains', () => {
        const r = mineLeadsFromText(
            'foo@greenhouse.io bar@boards.greenhouse.io baz@lever.co qux@workday.com legit@realemployer.com',
        );
        expect(r.emails).toEqual(['legit@realemployer.com']);
    });

    it('keeps careers@ / jobs@ / hr@ — those ARE the leads we want', () => {
        const r = mineLeadsFromText('Careers: careers@employer.com or jobs@employer.com or hr@employer.com');
        expect(new Set(r.emails)).toEqual(new Set(['careers@employer.com', 'jobs@employer.com', 'hr@employer.com']));
    });

    it('drops image-asset / templating noise like logo@2x.png', () => {
        const r = mineLeadsFromText('See <img src="logo@2x.png"/> and contact icon@3x.svg');
        expect(r.emails).toEqual([]);
    });

    it('returns empty for empty / null / undefined input', () => {
        expect(mineLeadsFromText('').emails).toEqual([]);
        expect(mineLeadsFromText(null).emails).toEqual([]);
        expect(mineLeadsFromText(undefined).emails).toEqual([]);
    });
});

describe('mineLeadsFromText — phones', () => {
    it('extracts US phone in (xxx) xxx-xxxx form', () => {
        const r = mineLeadsFromText('Call (415) 555-1234 today');
        expect(r.phones).toEqual(['415-555-1234']);
    });

    it('extracts US phone in xxx.xxx.xxxx form', () => {
        const r = mineLeadsFromText('Phone: 415.555.1234');
        expect(r.phones).toEqual(['415-555-1234']);
    });

    it('extracts +1 prefixed phone', () => {
        const r = mineLeadsFromText('Reach me at +1 415-555-1234');
        expect(r.phones).toEqual(['+1-415-555-1234']);
    });

    it('skips area codes starting with 0 or 1 (not valid NANP)', () => {
        const r = mineLeadsFromText('123-456-7890 not a phone, 015-555-1234 also no');
        expect(r.phones).toEqual([]);
    });

    it('dedupes when the same number appears in different formats', () => {
        const r = mineLeadsFromText('Call 415-555-1234 or (415) 555-1234');
        expect(r.phones).toEqual(['415-555-1234']);
    });
});

describe('mineLeadsFromText — websites', () => {
    it('extracts a clean employer website', () => {
        const r = mineLeadsFromText('Visit https://bigclinic.com/careers for more.');
        expect(r.websites).toEqual(['https://bigclinic.com/careers']);
    });

    it('drops trailing punctuation', () => {
        const r = mineLeadsFromText('See https://bigclinic.com.');
        expect(r.websites).toEqual(['https://bigclinic.com']);
    });

    it('drops ATS / job-board / our own URLs', () => {
        const r = mineLeadsFromText(
            'Apply: https://boards.greenhouse.io/x https://jobs.lever.co/y https://www.indeed.com/z https://realemp.com/careers',
        );
        expect(r.websites).toEqual(['https://realemp.com/careers']);
    });

    it('drops linkedin subdomains', () => {
        const r = mineLeadsFromText('See https://www.linkedin.com/in/jane');
        expect(r.websites).toEqual([]);
    });
});

describe('mineLeadsFromText — integration on a realistic posting tail', () => {
    it('pulls coherent contact info from a typical "About Us" / "How to Apply" block', () => {
        const text = `
            About Us
            Big Mental Health is a 50-clinician practice…

            How to Apply
            Email your CV to careers@bigmentalhealth.com or call (612) 555-9090.
            Visit us at https://www.bigmentalhealth.com/careers — applications
            open until July. Powered by Greenhouse: https://boards.greenhouse.io/bmh.
            For questions, contact recruiting@bigmentalhealth.com.
            (Do not reply to noreply@indeed.com — that is the aggregator.)
        `;
        const r = mineLeadsFromText(text);
        expect(new Set(r.emails)).toEqual(
            new Set(['careers@bigmentalhealth.com', 'recruiting@bigmentalhealth.com']),
        );
        expect(r.phones).toEqual(['612-555-9090']);
        expect(r.websites).toEqual(['https://www.bigmentalhealth.com/careers']);
    });
});
