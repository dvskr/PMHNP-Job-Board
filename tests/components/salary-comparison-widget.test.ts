/**
 * The job-page pay widget, rendered.
 *
 * From 2026-09-27 to 2026-10-05 this widget rendered nothing on any job page.
 * The salary engine started handing the page a state median in thousands, the
 * page kept dividing by 1,000 before passing it down, every state rounded to
 * zero, and the widget hides on zero. Nothing errored and no test noticed,
 * because the only checks on it read source text. These render it.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SalaryComparisonWidget from '@/components/SalaryComparisonWidget';
import { readCode } from '../helpers/source';

const render = (props: Parameters<typeof SalaryComparisonWidget>[0]): string =>
    renderToStaticMarkup(createElement(SalaryComparisonWidget, props));

describe('SalaryComparisonWidget', () => {
    it('shows the state and national medians and how they compare', () => {
        const html = render({ stateName: 'Texas', stateMedianK: 150, nationalMedianK: 120 });

        expect(html).toContain('$150k');
        expect(html).toContain('$120k');
        expect(html).toContain('25% more');
    });

    it('says less, not a negative percentage, when the state trails the nation', () => {
        const html = render({ stateName: 'Florida', stateMedianK: 90, nationalMedianK: 120 });

        expect(html).toContain('25% less');
        expect(html).not.toContain('-25');
    });

    it('drops the national comparison when that figure is withheld', () => {
        const html = render({ stateName: 'Texas', stateMedianK: 150, nationalMedianK: 0 });

        expect(html).toContain('$150k');
        expect(html).not.toContain('National median');
        expect(html).not.toContain('$0k');
    });

    it('renders nothing when the state median is withheld', () => {
        expect(render({ stateName: 'Wyoming', stateMedianK: 0, nationalMedianK: 120 })).toBe('');
    });

    it('places the job against the state median', () => {
        const html = render({
            stateName: 'Texas',
            stateMedianK: 150,
            nationalMedianK: 120,
            jobMinSalary: 160000,
            jobMaxSalary: 180000,
        });

        expect(html).toContain('$160k to $180k');
        expect(html).toContain('above');
    });

    it('calls its figures medians, never averages', () => {
        const html = render({ stateName: 'Texas', stateMedianK: 150, nationalMedianK: 120 });

        expect(html).toMatch(/median/i);
        expect(html).not.toMatch(/\bavg\b|average/i);
    });
});

describe('the job page hands the widget the engine figure untouched', () => {
    it('does not rescale a value the engine already returns in thousands', () => {
        const page = readCode('app/jobs/[slug]/page.tsx');

        expect(page).toMatch(/stateMedianK=\{stateAvgSalary\}/);
        expect(page).not.toMatch(/stateAvgSalary\s*\/\s*1000/);
    });
});
