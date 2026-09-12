/**
 * Static locks on the /settings save form (app/settings/page.tsx).
 *
 *   - The Per Hour / Per Year toggle mutated local state only: handleSave
 *     never put desiredSalaryType in the PATCH body, so an hourly expectation
 *     was stored without its rate type and read back as an annual salary.
 *   - The Company input was a live text field for employers even though the
 *     name is write-once. The server refuses the change now, but a form that
 *     offers an edit it cannot save is its own bug.
 *   - The summary counter and the server cap have to name the same limit, or
 *     the tail is silently sliced off on save.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const settingsSrc = fs.readFileSync(
    path.resolve(__dirname, '../../app/settings/page.tsx'),
    'utf8',
);
const routeSrc = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/auth/profile/route.ts'),
    'utf8',
);

// The single fetch body built by handleSave: it is the only PATCH that sends
// firstName, so anchor on that field and take the surrounding window.
const saveBody = (() => {
    const start = settingsSrc.indexOf('firstName: profile.firstName');
    expect(start).toBeGreaterThan(-1);
    return settingsSrc.slice(start, start + 2500);
})();

describe('handleSave PATCH body', () => {
    it('sends the desired salary rate type alongside the numbers', () => {
        expect(saveBody).toContain('desiredSalaryMin: profile.desiredSalaryMin');
        expect(saveBody).toContain('desiredSalaryType: profile.desiredSalaryType');
    });

    it('reports the server error text instead of a blanket retry message', () => {
        expect(saveBody).toContain("detail?.error || 'Failed to update profile. Please try again.'");
    });
});

describe('company field', () => {
    it('is read-only for employers', () => {
        const companyBlock = settingsSrc.slice(
            settingsSrc.indexOf('{/* Company (only for employers)'),
            settingsSrc.indexOf('SECTION — Address'),
        );
        expect(companyBlock).toContain('readOnly');
        expect(companyBlock).not.toContain('updateProfile({ company:');
    });
});

describe('professional summary limit', () => {
    it('the editor counter and the server cap agree', () => {
        expect(settingsSrc).toContain('if (e.target.value.length <= 1000)');
        expect(settingsSrc).toContain('/1000');
        expect(routeSrc).toContain('const BIO_MAX_LENGTH = 1000');
        expect(routeSrc).toContain('sanitizeText(body.bio, BIO_MAX_LENGTH)');
    });
});
