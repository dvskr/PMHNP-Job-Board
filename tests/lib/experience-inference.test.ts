import { describe, it, expect } from 'vitest';
import { inferExperience, inferFromText } from '@/lib/experience-inference';

describe('inferExperience — legacy enum mapping', () => {
  it('maps "New Grad" with high confidence', () => {
    const result = inferExperience({ experienceLevel: 'New Grad', description: '' });
    expect(result).toMatchObject({
      minYearsExperience: 0,
      maxYearsExperience: null,
      newGradFriendly: true,
      confidence: 'high',
      source: 'legacy:new-grad',
    });
  });

  it('maps "Entry-Level" with high confidence', () => {
    const result = inferExperience({ experienceLevel: 'Entry-Level', description: '' });
    expect(result).toMatchObject({
      minYearsExperience: 0,
      newGradFriendly: true,
      confidence: 'high',
    });
  });

  it('maps "Mid-Level" to 2-5 yrs', () => {
    const result = inferExperience({ experienceLevel: 'Mid-Level', description: '' });
    expect(result).toMatchObject({
      minYearsExperience: 2,
      maxYearsExperience: 5,
      newGradFriendly: false,
      confidence: 'high',
    });
  });

  it('maps "Senior" to 5+ yrs', () => {
    const result = inferExperience({ experienceLevel: 'Senior', description: '' });
    expect(result).toMatchObject({
      minYearsExperience: 5,
      maxYearsExperience: null,
      newGradFriendly: false,
      confidence: 'high',
    });
  });

  it('is case-insensitive on legacy values', () => {
    expect(inferExperience({ experienceLevel: 'SENIOR', description: '' })?.minYearsExperience).toBe(5);
    expect(inferExperience({ experienceLevel: '  new grad  ', description: '' })?.newGradFriendly).toBe(true);
  });

  it('falls through to description when legacy value is unknown', () => {
    const result = inferExperience({
      experienceLevel: 'Director-Level', // not in the legacy enum
      description: 'Looking for new graduates with strong clinical skills.',
    });
    expect(result).toMatchObject({
      newGradFriendly: true,
      confidence: 'medium',
    });
  });
});

describe('inferFromText — new-grad phrases', () => {
  it.each([
    'We welcome new grad PMHNPs to apply',
    'New graduate candidates encouraged',
    'Open to recent graduates',
    'Recent grads welcome',
    'This is an entry-level position',
    'Perfect entry level role',
    '0 years of experience required',
  ])('detects new-grad phrase in: %s', (text) => {
    const result = inferFromText(text);
    expect(result?.newGradFriendly).toBe(true);
    expect(result?.minYearsExperience).toBe(0);
  });

  it('does NOT match "new" alone or "graduate program"', () => {
    expect(inferFromText('Join our new outpatient clinic')).toBeNull();
    expect(inferFromText('We have a great graduate program for nurses')).toBeNull();
  });
});

describe('inferFromText — range patterns', () => {
  it('parses "1-2 years" as min=1, max=2', () => {
    const result = inferFromText('Requires 1-2 years of clinical experience.');
    expect(result).toMatchObject({
      minYearsExperience: 1,
      maxYearsExperience: 2,
      confidence: 'medium',
    });
  });

  it('parses "5-7 years"', () => {
    const result = inferFromText('5-7 years experience preferred');
    expect(result?.minYearsExperience).toBe(5);
    expect(result?.maxYearsExperience).toBe(7);
  });

  it('parses "3 to 5 years" (word "to")', () => {
    const result = inferFromText('3 to 5 years required');
    // 3 snaps down to bucket 2 — documented behavior of snapMinYearsToBucket.
    expect(result?.minYearsExperience).toBe(2);
    expect(result?.maxYearsExperience).toBe(5);
  });

  it('snaps non-bucket min values down to the nearest bucket', () => {
    const result = inferFromText('4-6 years of experience required');
    expect(result?.minYearsExperience).toBe(2); // 4 → snaps down to 2
    expect(result?.maxYearsExperience).toBe(6); // max is preserved verbatim
  });
});

describe('inferFromText — open-ended patterns', () => {
  it('parses "5+ years"', () => {
    const result = inferFromText('Minimum 5+ years of psychiatric experience.');
    expect(result).toMatchObject({
      minYearsExperience: 5,
      maxYearsExperience: null,
      confidence: 'medium',
    });
  });

  it('parses "minimum of 7 years"', () => {
    const result = inferFromText('A minimum of 7 years in clinical practice.');
    expect(result?.minYearsExperience).toBe(7);
    expect(result?.maxYearsExperience).toBeNull();
  });

  it('parses "at least 10 years"', () => {
    const result = inferFromText('Candidates with at least 10 years preferred.');
    expect(result?.minYearsExperience).toBe(10);
  });

  it('parses bare "5 years experience"', () => {
    const result = inferFromText('5 years experience in mental health.');
    expect(result?.minYearsExperience).toBe(5);
  });
});

describe('inferFromText — combined signals', () => {
  it('combines "5+ years" with new-grad qualifier', () => {
    const result = inferFromText(
      'Ideally 5+ years experience, but we will consider exceptional new grads.',
    );
    expect(result).toMatchObject({
      minYearsExperience: 5,
      maxYearsExperience: null,
      newGradFriendly: true,
    });
  });

  it('prefers range pattern over plus pattern when both match', () => {
    // Without preferring ranges, "1-2 years" would be captured as just "1 year"
    // by the plus pattern and lose the upper bound.
    const result = inferFromText('We need 1-2 years of inpatient experience.');
    expect(result?.maxYearsExperience).toBe(2);
  });
});

describe('inferFromText — null returns', () => {
  it('returns null for empty string', () => {
    expect(inferFromText('')).toBeNull();
  });

  it('returns null when no experience signal present', () => {
    expect(
      inferFromText(
        'PMHNP position with competitive salary, full benefits, and flexible schedule.',
      ),
    ).toBeNull();
  });
});

describe('inferExperience — integration', () => {
  it('downgrades a "New Grad" legacy enum when description has an explicit year floor', () => {
    // Disconfirmation guard (2026-05-14): the normalizer used to tag
    // "1 year experience" rows as "New Grad". When body text clearly
    // states a 1+ year minimum, the text wins and we downgrade to
    // Mid-Level — newGradFriendly=false, min from the regex extraction.
    const result = inferExperience({
      experienceLevel: 'New Grad',
      description: 'Will train candidates with 5+ years of experience',
    });
    expect(result?.newGradFriendly).toBe(false);
    expect(result?.minYearsExperience).toBe(5);
    expect(result?.confidence).toBe('medium');
    expect(result?.source.startsWith('legacy:new grad->text:')).toBe(true);
  });

  it('keeps legacy "New Grad" enum when description has no year floor', () => {
    // No regex year-match means the legacy enum is authoritative.
    const result = inferExperience({
      experienceLevel: 'New Grad',
      description: 'Open to new graduates. We welcome residency completion.',
    });
    expect(result?.confidence).toBe('high');
    expect(result?.newGradFriendly).toBe(true);
    expect(result?.minYearsExperience).toBe(0);
  });

  it('falls back to description regex when experienceLevel is null', () => {
    const result = inferExperience({
      experienceLevel: null,
      description: 'Minimum 7+ years required.',
    });
    expect(result?.minYearsExperience).toBe(7);
    expect(result?.confidence).toBe('medium');
  });

  it('returns null when neither source classifies', () => {
    const result = inferExperience({
      experienceLevel: null,
      description: 'Great clinic in a nice location.',
    });
    expect(result).toBeNull();
  });
});
