import { describe, it, expect } from 'vitest';
import { isRelevantJob } from '../../lib/utils/job-filter';

describe('isRelevantJob — Previously Blocked Legitimate PMHNP Jobs', () => {
    // These were previously blocked by overly-broad negative keywords

    it('should PASS "Associate Clinical Director - PMHNP"', () => {
        expect(isRelevantJob('Associate Clinical Director - PMHNP', 'psychiatric nursing role')).toBe(true);
    });

    it('should PASS "New Graduate PMHNP"', () => {
        expect(isRelevantJob('New Graduate PMHNP', 'psychiatric mental health nurse practitioner new grad program')).toBe(true);
    });

    it('should PASS "Float PMHNP"', () => {
        expect(isRelevantJob('Float PMHNP', 'psychiatric float nurse practitioner across locations')).toBe(true);
    });

    it('should PASS "Child & Adolescent PMHNP"', () => {
        expect(isRelevantJob('Child & Adolescent PMHNP', 'child and adolescent psychiatric nurse practitioner')).toBe(true);
    });

    it('should PASS "Outpatient PMHNP Position"', () => {
        expect(isRelevantJob('Outpatient PMHNP Position', 'outpatient psychiatric clinic')).toBe(true);
    });

    it('should PASS "Psychiatric Nurse Practitioner - Hospice"', () => {
        expect(isRelevantJob('Psychiatric Nurse Practitioner - Hospice', 'psychiatric NP providing mental health care in hospice setting')).toBe(true);
    });

    it('should PASS "Clinical Manager - PMHNP"', () => {
        expect(isRelevantJob('Clinical Manager - PMHNP', 'managing a team of psychiatric nurse practitioners')).toBe(true);
    });

    it('should PASS "PMHNP / FNP - Psychiatry"', () => {
        expect(isRelevantJob('PMHNP / FNP - Psychiatry', 'dual-certified nurse practitioner for psychiatric care')).toBe(true);
    });

    it('should PASS "Director of Psychiatric Services" with NP requirement', () => {
        expect(isRelevantJob('Director of Psychiatric Services', 'PMHNP required, leading psychiatric services')).toBe(true);
    });
});

describe('isRelevantJob — Should Still Be Blocked', () => {
    // These should still be correctly filtered out

    it('should FAIL "Office Manager"', () => {
        expect(isRelevantJob('Office Manager', 'manage office operations at a clinic')).toBe(false);
    });

    it('should FAIL "Scheduling Coordinator"', () => {
        expect(isRelevantJob('Scheduling Coordinator', 'schedule patient appointments')).toBe(false);
    });

    it('should FAIL "Medical Director"', () => {
        expect(isRelevantJob('Medical Director', 'physician overseeing clinical operations')).toBe(false);
    });

    it('should FAIL "Registered Nurse"', () => {
        expect(isRelevantJob('Registered Nurse', 'RN in psychiatric unit')).toBe(false);
    });

    it('should FAIL "Physical Therapist"', () => {
        expect(isRelevantJob('Physical Therapist', 'outpatient PT clinic')).toBe(false);
    });

    it('should FAIL "Social Worker - LCSW"', () => {
        expect(isRelevantJob('Social Worker - LCSW', 'licensed clinical social worker for mental health')).toBe(false);
    });

    it('should FAIL "Practice Manager"', () => {
        expect(isRelevantJob('Practice Manager', 'manage daily operations of psychiatric practice')).toBe(false);
    });

    it('should FAIL "Director of Nursing"', () => {
        expect(isRelevantJob('Director of Nursing', 'oversee nursing staff in behavioral health unit')).toBe(false);
    });
});

describe('isRelevantJob — Core PMHNP Titles Still Pass', () => {
    it('should PASS "PMHNP"', () => {
        expect(isRelevantJob('PMHNP', 'psychiatric nurse practitioner role')).toBe(true);
    });

    it('should PASS "Psychiatric Nurse Practitioner"', () => {
        expect(isRelevantJob('Psychiatric Nurse Practitioner', 'full-time position in outpatient clinic')).toBe(true);
    });

    it('should PASS "Psychiatric Mental Health Nurse Practitioner"', () => {
        expect(isRelevantJob('Psychiatric Mental Health Nurse Practitioner', 'telehealth and in-person')).toBe(true);
    });

    it('should PASS "Nurse Practitioner" with psychiatric context in title', () => {
        expect(isRelevantJob('Nurse Practitioner - Psychiatry', 'behavioral health outpatient services')).toBe(true);
    });
});
