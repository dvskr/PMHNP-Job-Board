/**
 * Two apply-surface defects found 2026-09-13, both pinned here as source
 * assertions (vitest runs in a node environment: no DOM, no renderer).
 *
 *  1. Hydration. JobCard and ApplyButton read the localStorage-backed
 *     `isApplied(id)` during render, while the server render could only ever
 *     see "not applied". The hook no longer seeds itself in the render phase;
 *     both call sites additionally gate on isHydrated, the same mount guard
 *     the neighbouring `viewed` and freshness values already use.
 *
 *  2. Confirmation. ApplyButton's onSuccess handler called
 *     setShowPlatformApply(false), which unmounted InPlatformApplyForm in the
 *     same commit that flipped its `submitted` flag: the "Application
 *     Submitted" panel and its similar-jobs list could never render, and the
 *     candidate got no acknowledgement at all. The form closes itself now, via
 *     its own Done/X buttons.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const JOB_CARD = read('components/JobCard.tsx');
const APPLY_BUTTON = read('components/ApplyButton.tsx');
const APPLY_FORM = read('components/InPlatformApplyForm.tsx');

describe('applied badge is mount-guarded', () => {
    it('JobCard gates isApplied on isHydrated', () => {
        expect(JOB_CARD).toContain('const applied = isHydrated && isApplied(job.id);');
    });

    it('ApplyButton gates isApplied on isHydrated', () => {
        expect(APPLY_BUTTON).toContain('const applied = (isHydrated && isApplied(jobId)) || serverApplied?.applied;');
        expect(APPLY_BUTTON).toContain('isHydrated');
    });
});

describe('Easy Apply confirmation survives submit', () => {
    it('the success handler no longer unmounts the form', () => {
        const start = APPLY_BUTTON.indexOf('const handlePlatformApplySuccess');
        const end = APPLY_BUTTON.indexOf('const handlePlatformApplyClose');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const body = APPLY_BUTTON.slice(start, end);
        expect(body).toContain('markApplied(jobId)');
        expect(body).not.toContain('setShowPlatformApply(false)');
    });

    it('the form still closes itself, so the modal is not stuck open', () => {
        expect(APPLY_BUTTON).toContain('onClose={handlePlatformApplyClose}');
        expect(APPLY_BUTTON).toContain('setShowPlatformApply(false)');
        // Done and X in the success panel both call onClose.
        expect(APPLY_FORM).toContain('onClick={onClose}');
    });

    it('closing re-checks the server so the already-applied notice appears', () => {
        const start = APPLY_BUTTON.indexOf('const handlePlatformApplyClose');
        const body = APPLY_BUTTON.slice(start, start + 600);
        expect(body).toContain('/api/applications/check?jobId=');
        expect(body).toContain('setServerApplied');
    });
});

describe('cover letter upload does not masquerade as a resume', () => {
    it('the apply form sends its own upload type', () => {
        expect(APPLY_FORM).toContain("formData.append('type', 'cover_letter')");
        expect(APPLY_FORM).not.toContain('reuse resume bucket for cover letters');
    });
});
