import { describe, it, expect } from 'vitest';
import { parseLocation } from '../../lib/location-parser';

describe('parseLocation — Standard patterns', () => {
    it('parses "City, ST"', () => {
        const r = parseLocation('Austin, TX');
        expect(r.city).toBe('Austin');
        expect(r.stateCode).toBe('TX');
        expect(r.state).toBe('Texas');
        expect(r.confidence).toBe(1.0);
    });

    it('parses "City, State"', () => {
        const r = parseLocation('Portland, Oregon');
        expect(r.city).toBe('Portland');
        expect(r.stateCode).toBe('OR');
        expect(r.state).toBe('Oregon');
    });

    it('parses "City, state" (lowercase)', () => {
        const r = parseLocation('Denver, colorado');
        expect(r.city).toBe('Denver');
        expect(r.stateCode).toBe('CO');
    });
});

describe('parseLocation — Remote patterns', () => {
    it('parses "Remote" as remote-only', () => {
        const r = parseLocation('Remote');
        expect(r.isRemote).toBe(true);
        expect(r.city).toBeNull();
    });

    it('parses "Remote - Austin, TX" with city', () => {
        const r = parseLocation('Remote - Austin, TX');
        expect(r.isRemote).toBe(true);
        expect(r.city).toBe('Austin');
        expect(r.stateCode).toBe('TX');
    });

    it('parses "Austin, TX (Remote)"', () => {
        const r = parseLocation('Austin, TX (Remote)');
        expect(r.isRemote).toBe(true);
        expect(r.city).toBe('Austin');
        expect(r.stateCode).toBe('TX');
    });

    it('parses "Telehealth - Denver, CO"', () => {
        const r = parseLocation('Telehealth - Denver, CO');
        expect(r.isRemote).toBe(true);
        expect(r.city).toBe('Denver');
        expect(r.stateCode).toBe('CO');
    });

    it('parses "Virtual, United States" as remote', () => {
        const r = parseLocation('Virtual, United States');
        expect(r.isRemote).toBe(true);
    });

    it('parses "Work From Home" as remote', () => {
        const r = parseLocation('Work From Home');
        expect(r.isRemote).toBe(true);
    });
});

describe('parseLocation — Hybrid patterns', () => {
    it('parses "Hybrid - Seattle, WA"', () => {
        const r = parseLocation('Hybrid - Seattle, WA');
        expect(r.isHybrid).toBe(true);
        expect(r.city).toBe('Seattle');
        expect(r.stateCode).toBe('WA');
    });
});

describe('parseLocation — HQ and Workday patterns', () => {
    it('parses "HQ: Chicago, IL"', () => {
        const r = parseLocation('HQ: Chicago, IL');
        expect(r.city).toBe('Chicago');
        expect(r.stateCode).toBe('IL');
    });

    it('parses Workday "US-TX-Austin" format', () => {
        const r = parseLocation('US-TX-Austin');
        expect(r.city).toBe('Austin');
        expect(r.stateCode).toBe('TX');
    });

    it('parses Workday "US-CA-San Francisco" format', () => {
        const r = parseLocation('US-CA-San Francisco');
        expect(r.city).toBe('San Francisco');
        expect(r.stateCode).toBe('CA');
    });
});

describe('parseLocation — Country suffix patterns', () => {
    it('parses "Austin, TX, United States"', () => {
        const r = parseLocation('Austin, TX, United States');
        expect(r.city).toBe('Austin');
        expect(r.stateCode).toBe('TX');
    });

    it('parses "Denver, CO, USA"', () => {
        const r = parseLocation('Denver, CO, USA');
        expect(r.city).toBe('Denver');
        expect(r.stateCode).toBe('CO');
    });
});

describe('parseLocation — Edge cases', () => {
    it('handles empty string', () => {
        const r = parseLocation('');
        expect(r.confidence).toBe(0.3);
        expect(r.city).toBeNull();
    });

    it('handles null-like input', () => {
        const r = parseLocation(null as unknown as string);
        expect(r.city).toBeNull();
    });

    it('parses state name only', () => {
        const r = parseLocation('California');
        expect(r.state).toBe('California');
        expect(r.stateCode).toBe('CA');
        expect(r.city).toBeNull();
    });

    it('parses state code only', () => {
        const r = parseLocation('TX');
        expect(r.stateCode).toBe('TX');
        expect(r.state).toBe('Texas');
    });

    it('handles "Nationwide" as remote', () => {
        const r = parseLocation('Nationwide');
        expect(r.isRemote).toBe(true);
    });

    it('handles "United States" as remote', () => {
        const r = parseLocation('United States');
        expect(r.isRemote).toBe(true);
    });

    it('handles multi-word city', () => {
        const r = parseLocation('New York, NY');
        expect(r.city).toBe('New York');
        expect(r.stateCode).toBe('NY');
    });

    it('handles "San Juan, Puerto Rico" gracefully', () => {
        // Puerto Rico is not in STATE_CODES, so should return low confidence
        const r = parseLocation('San Juan, Puerto Rico');
        expect(r.state).toBeNull();
    });
});

describe('parseLocation — Adzuna county format', () => {
    it('parses "Colorado Springs, El Paso County"', () => {
        const r = parseLocation('Colorado Springs, El Paso County');
        expect(r.city).toBe('Colorado Springs');
    });

    it('parses "Raleigh, Wake County"', () => {
        const r = parseLocation('Raleigh, Wake County');
        expect(r.city).toBe('Raleigh');
    });

    it('parses "San Diego, San Diego County"', () => {
        const r = parseLocation('San Diego, San Diego County');
        expect(r.city).toBe('San Diego');
    });

    it('parses "Orlando, Orange County"', () => {
        const r = parseLocation('Orlando, Orange County');
        expect(r.city).toBe('Orlando');
    });

    it('parses "Springfield, Greene County"', () => {
        const r = parseLocation('Springfield, Greene County');
        expect(r.city).toBe('Springfield');
    });
});

describe('parseLocation — Containment states (prod misfile regression)', () => {
    // Seen in prod: an Ashby listing with location "West Virginia" was stored
    // as city "West", state "Virginia", stateCode VA — filed under the wrong
    // state entirely. The fallback name scan matched "Virginia" first because
    // it iterated in registry order instead of longest-name-first.
    it('parses bare "West Virginia" as WV, not VA', () => {
        const r = parseLocation('West Virginia');
        expect(r.stateCode).toBe('WV');
        expect(r.state).toBe('West Virginia');
        expect(r.city).toBeNull();
    });

    it('parses "Remote - West Virginia" as remote WV', () => {
        const r = parseLocation('Remote - West Virginia');
        expect(r.isRemote).toBe(true);
        expect(r.stateCode).toBe('WV');
    });

    it('parses "Charleston, West Virginia" as WV with city', () => {
        const r = parseLocation('Charleston, West Virginia');
        expect(r.city).toBe('Charleston');
        expect(r.stateCode).toBe('WV');
    });

    it('still parses plain "Virginia" as VA', () => {
        const r = parseLocation('Virginia');
        expect(r.stateCode).toBe('VA');
    });

    it('still parses "Virginia Beach, Virginia" with the right city', () => {
        const r = parseLocation('Virginia Beach, Virginia');
        expect(r.city).toBe('Virginia Beach');
        expect(r.stateCode).toBe('VA');
    });

    it('parses "District of Columbia" as DC', () => {
        const r = parseLocation('District of Columbia');
        expect(r.stateCode).toBe('DC');
    });
});

describe('parseLocation — District of Columbia forms', () => {
    // "Washington, D.C." fell through every code pattern (dots defeat the
    // 2-letter matcher) until the state-NAME scan, where bare "Washington"
    // matched and filed the nation's capital under WA.
    it('parses "Washington, D.C." as DC', () => {
        const r = parseLocation('Washington, D.C.');
        expect(r.stateCode).toBe('DC');
        expect(r.city).toBe('Washington');
    });

    it('parses "Washington D.C." as DC', () => {
        const r = parseLocation('Washington D.C.');
        expect(r.stateCode).toBe('DC');
    });

    it('parses "Washington, DC" as DC', () => {
        const r = parseLocation('Washington, DC');
        expect(r.stateCode).toBe('DC');
        expect(r.city).toBe('Washington');
    });

    it('still parses bare "Washington" as the state (WA)', () => {
        const r = parseLocation('Washington');
        expect(r.stateCode).toBe('WA');
    });

    it('still parses "Seattle, Washington" as WA', () => {
        const r = parseLocation('Seattle, Washington');
        expect(r.city).toBe('Seattle');
        expect(r.stateCode).toBe('WA');
    });
});
