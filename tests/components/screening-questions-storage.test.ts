/**
 * Screening questions must not travel between jobs.
 *
 * Every surface shared one browser key, `jobScreeningQuestions`. The job edit
 * page writes that key with the job's existing questions when it loads, so
 * opening a live job's edit page and then composing a NEW posting submitted
 * the first job's questions, knockout rules included. Knockout rules auto
 * reject applicants, so the wrong job's rules rejected the wrong candidates
 * silently. Clearing the draft did not clear them either.
 *
 * Every surface is now scoped: the post-job flow to its own key, the job edit
 * page to one keyed by the job's edit token. Nothing reads the shared key, and
 * the builder deletes it on mount so questions cached there before the fix
 * cannot resurface.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    POST_JOB_SCREENING_SCOPE,
    editScreeningScope,
    readScreeningQuestions,
    writeScreeningQuestions,
    clearScreeningQuestions,
} from '@/components/ScreeningQuestionsBuilder';

const LEGACY_KEY = 'jobScreeningQuestions';
const SCOPED_KEY = `${LEGACY_KEY}:${POST_JOB_SCREENING_SCOPE}`;

/** Minimal localStorage stand-in: the test env is node, not jsdom. */
function installStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
    });
    return store;
}

const EDIT_PAGE_QUESTIONS = JSON.stringify([{
    id: 'q-fic-1',
    text: 'Are you licensed in the state where this position is located?',
    type: 'boolean',
    options: [],
    required: true,
    knockout: true,
    knockoutAnswer: 'no',
}]);

const POST_JOB_QUESTIONS = JSON.stringify([{
    id: 'q-fic-2',
    text: 'Do you have telepsychiatry experience?',
    type: 'boolean',
    options: [],
    required: false,
    knockout: false,
    knockoutAnswer: '',
}]);

let store: Map<string, string>;
beforeEach(() => {
    store = installStorage();
});

describe('readScreeningQuestions', () => {
    it('ignores questions another surface left in the shared key', () => {
        store.set(LEGACY_KEY, EDIT_PAGE_QUESTIONS);

        expect(readScreeningQuestions(POST_JOB_SCREENING_SCOPE)).toEqual([]);
    });

    it('returns the questions this scope owns', () => {
        store.set(LEGACY_KEY, EDIT_PAGE_QUESTIONS);
        store.set(SCOPED_KEY, POST_JOB_QUESTIONS);

        const questions = readScreeningQuestions(POST_JOB_SCREENING_SCOPE);
        expect(questions).toHaveLength(1);
        expect(questions[0].text).toMatch(/telepsychiatry/);
    });

    it('returns an empty list for corrupt storage rather than throwing', () => {
        store.set(SCOPED_KEY, '{not json');

        expect(readScreeningQuestions(POST_JOB_SCREENING_SCOPE)).toEqual([]);
    });

    it('returns an empty list when storage itself is unavailable', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('storage disabled'); },
            setItem: () => { throw new Error('storage disabled'); },
            removeItem: () => { throw new Error('storage disabled'); },
        });

        expect(readScreeningQuestions(POST_JOB_SCREENING_SCOPE)).toEqual([]);
    });
});

describe('scopes are isolated from each other', () => {
    it('two edit pages do not share questions', () => {
        writeScreeningQuestions(editScreeningScope('token-fic-a'), JSON.parse(EDIT_PAGE_QUESTIONS));

        expect(readScreeningQuestions(editScreeningScope('token-fic-b'))).toEqual([]);
        expect(readScreeningQuestions(editScreeningScope('token-fic-a'))).toHaveLength(1);
    });

    it('an edit page cannot hand its questions to a new posting', () => {
        writeScreeningQuestions(editScreeningScope('token-fic-a'), JSON.parse(EDIT_PAGE_QUESTIONS));

        expect(readScreeningQuestions(POST_JOB_SCREENING_SCOPE)).toEqual([]);
    });

    it('writeScreeningQuestions survives storage being unavailable', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('storage disabled'); },
            setItem: () => { throw new Error('storage disabled'); },
            removeItem: () => { throw new Error('storage disabled'); },
        });

        expect(() => writeScreeningQuestions('any-scope', [])).not.toThrow();
    });
});

describe('clearScreeningQuestions', () => {
    it('removes the scope it was asked to clear', () => {
        store.set(SCOPED_KEY, POST_JOB_QUESTIONS);

        clearScreeningQuestions(POST_JOB_SCREENING_SCOPE);

        expect(store.has(SCOPED_KEY)).toBe(false);
    });

    it('leaves another scope alone', () => {
        const otherKey = `${LEGACY_KEY}:${editScreeningScope('token-fic-a')}`;
        store.set(SCOPED_KEY, POST_JOB_QUESTIONS);
        store.set(otherKey, EDIT_PAGE_QUESTIONS);

        clearScreeningQuestions(POST_JOB_SCREENING_SCOPE);

        expect(store.has(SCOPED_KEY)).toBe(false);
        expect(store.get(otherKey)).toBe(EDIT_PAGE_QUESTIONS);
    });
});

/**
 * Source assertions: the fix only holds if the pages actually use the scoped
 * helpers. A page reverting to `localStorage.getItem('jobScreeningQuestions')`
 * reopens the leak with no test failure anywhere else.
 */
describe('every surface is wired to a scope', () => {
    const read = (rel: string): string =>
        fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

    const SURFACES = [
        'app/post-job/page.tsx',
        'app/post-job/preview/page.tsx',
        'app/post-job/checkout/page.tsx',
        'app/jobs/edit/[token]/page.tsx',
        'app/success/page.tsx',
    ];

    it.each(SURFACES)('%s never touches the retired shared key directly', (rel) => {
        expect(read(rel)).not.toMatch(/['"]jobScreeningQuestions['"]/);
    });

    it('the post-job form passes its scope to the builder', () => {
        expect(read('app/post-job/page.tsx'))
            .toMatch(/<ScreeningQuestionsBuilder scope=\{POST_JOB_SCREENING_SCOPE\}/);
    });

    it('the job edit page scopes the builder to its own token', () => {
        const src = read('app/jobs/edit/[token]/page.tsx');
        expect(src).toMatch(/<ScreeningQuestionsBuilder scope=\{editScreeningScope\(token\)\}/);
        expect(src).toMatch(/writeScreeningQuestions\(editScreeningScope\(/);
        expect(src).toMatch(/readScreeningQuestions\(editScreeningScope\(/);
    });

    it('preview and checkout read only the post-job scope', () => {
        for (const rel of ['app/post-job/preview/page.tsx', 'app/post-job/checkout/page.tsx']) {
            expect(read(rel), rel).toMatch(/readScreeningQuestions\(POST_JOB_SCREENING_SCOPE\)/);
        }
    });

    it('clearing the draft clears the questions too', () => {
        const src = read('app/post-job/page.tsx');
        const clearDraft = src.slice(src.indexOf('const performClearDraft'));
        expect(clearDraft.slice(0, 800)).toMatch(/clearScreeningQuestions\(POST_JOB_SCREENING_SCOPE\)/);
    });

    it('a completed post clears the questions', () => {
        expect(read('app/success/page.tsx'))
            .toMatch(/clearScreeningQuestions\(POST_JOB_SCREENING_SCOPE\)/);
    });

    it('the builder evicts the retired shared key on mount', () => {
        expect(read('components/ScreeningQuestionsBuilder.tsx'))
            .toMatch(/removeItem\(RETIRED_SHARED_KEY\)/);
    });
});
