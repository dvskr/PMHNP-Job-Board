/**
 * Resume presentation registry invariants (lib/resume-studio/templates.ts).
 *
 * This module is the SINGLE source of truth read by both the live preview
 * (components/resume-studio/ResumePreview.tsx) and the PDF export
 * (lib/resume-studio/pdf.tsx). If it drifts, the preview stops predicting the
 * export, which is the one promise the studio makes. These pin the contract.
 */
import { describe, it, expect } from 'vitest';
import {
  RESUME_TEMPLATES,
  RESUME_FONTS,
  RESUME_DENSITIES,
  RESUME_PAPERS,
  DEFAULT_STYLE,
  getTemplate,
  getFont,
  getDensity,
  getPaper,
  ptToPx,
  resolveStyle,
  resolveResumeStyle,
} from '@/lib/resume-studio/templates';

describe('registry shape', () => {
  it('exposes the five templates, four fonts, two densities, two papers the UI offers', () => {
    expect(RESUME_TEMPLATES).toHaveLength(5);
    expect(RESUME_FONTS).toHaveLength(4);
    expect(RESUME_DENSITIES).toHaveLength(2);
    expect(RESUME_PAPERS).toHaveLength(2);
  });

  it('every id is unique (a duplicate would make a picker option unreachable)', () => {
    const ids = (arr: readonly { id: string }[]) => arr.map((x) => x.id);
    for (const arr of [RESUME_TEMPLATES, RESUME_FONTS, RESUME_DENSITIES, RESUME_PAPERS]) {
      expect(new Set(ids(arr)).size).toBe(arr.length);
    }
  });

  it('every template default font resolves to a real font', () => {
    for (const t of RESUME_TEMPLATES) {
      expect(RESUME_FONTS.some((f) => f.id === t.defaultFont)).toBe(true);
    }
  });

  it('every font maps to a PDF family @react-pdf ships built in', () => {
    // Embedding a webfont would add a network fetch to every export and is a
    // common cause of blank PDFs on serverless.
    for (const f of RESUME_FONTS) {
      expect(['Times-Roman', 'Helvetica']).toContain(f.pdfFamily);
      expect(['Times-Bold', 'Helvetica-Bold']).toContain(f.pdfBold);
      expect(f.pdfBold.startsWith(f.pdfFamily.split('-')[0])).toBe(true);
    }
  });

  it('densities are internally ordered: compact is smaller than roomy on every axis', () => {
    const roomy = getDensity('roomy');
    const compact = getDensity('compact');
    expect(compact.bodyPt).toBeLessThan(roomy.bodyPt);
    expect(compact.namePt).toBeLessThan(roomy.namePt);
    expect(compact.lineHeight).toBeLessThan(roomy.lineHeight);
    expect(compact.marginPt).toBeLessThan(roomy.marginPt);
    expect(compact.sectionGapPt).toBeLessThan(roomy.sectionGapPt);
  });

  it('paper sizes match the real PostScript point dimensions', () => {
    expect(getPaper('letter')).toMatchObject({ widthPt: 612, heightPt: 792, pdfSize: 'LETTER' });
    expect(getPaper('legal')).toMatchObject({ widthPt: 612, heightPt: 1008, pdfSize: 'LEGAL' });
  });

  it('margins leave a usable text column on the narrowest paper', () => {
    for (const d of RESUME_DENSITIES) {
      const usable = getPaper('letter').widthPt - d.marginPt * 2;
      expect(usable).toBeGreaterThan(400);
    }
  });
});

describe('getters fall back instead of throwing', () => {
  it('unknown, null, and undefined ids return the first entry', () => {
    for (const bad of [undefined, null, '', 'nope', 'CLASSIC']) {
      expect(getTemplate(bad as string | null | undefined).id).toBe('classic');
      expect(getFont(bad as string | null | undefined).id).toBe('plex-serif');
      expect(getDensity(bad as string | null | undefined).id).toBe('roomy');
      expect(getPaper(bad as string | null | undefined).id).toBe('letter');
    }
  });
});

describe('ptToPx', () => {
  it('converts points to CSS pixels at 96dpi', () => {
    expect(ptToPx(72)).toBe(96);
    expect(ptToPx(0)).toBe(0);
    expect(ptToPx(612)).toBe(816); // letter width in px
    expect(ptToPx(792)).toBe(1056); // letter height in px
  });
});

describe('resolveStyle', () => {
  it('keeps every valid value the caller supplies', () => {
    expect(resolveStyle({ font: 'lora', density: 'compact', paper: 'legal' }, 'modern')).toEqual({
      font: 'lora',
      density: 'compact',
      paper: 'legal',
    });
  });

  it('falls back to the template default font, not a global default', () => {
    // A document with no stored style should look like its template intends.
    expect(resolveStyle(null, 'modern').font).toBe(getTemplate('modern').defaultFont);
    expect(resolveStyle(undefined, 'executive').font).toBe(getTemplate('executive').defaultFont);
    expect(resolveStyle({}, 'minimal').font).toBe(getTemplate('minimal').defaultFont);
  });

  it('survives hostile or malformed JSON from the styleConfig column', () => {
    for (const raw of [null, undefined, 0, '', 'string', [], true, { font: 42 }, { density: {} }]) {
      const out = resolveStyle(raw, 'classic');
      expect(RESUME_FONTS.some((f) => f.id === out.font)).toBe(true);
      expect(RESUME_DENSITIES.some((d) => d.id === out.density)).toBe(true);
      expect(RESUME_PAPERS.some((p) => p.id === out.paper)).toBe(true);
    }
  });

  it('replaces only the invalid field, preserving valid siblings', () => {
    const out = resolveStyle({ font: 'bogus', density: 'compact', paper: 'legal' }, 'classic');
    expect(out.density).toBe('compact');
    expect(out.paper).toBe('legal');
    expect(out.font).toBe(getTemplate('classic').defaultFont);
  });

  it('density and paper fall back to the documented defaults', () => {
    expect(resolveStyle({}, 'classic').density).toBe(DEFAULT_STYLE.density);
    expect(resolveStyle({}, 'classic').paper).toBe(DEFAULT_STYLE.paper);
  });
});

describe('resolveResumeStyle', () => {
  it('returns a fully resolved bundle whose config matches its parts', () => {
    const r = resolveResumeStyle('enterprise', { font: 'grotesk', density: 'compact', paper: 'legal' });
    expect(r.template.id).toBe('enterprise');
    expect(r.font.id).toBe('grotesk');
    expect(r.density.id).toBe('compact');
    expect(r.paper.id).toBe('legal');
    // The config echo must agree with the resolved objects, or a caller that
    // trusts one and persists the other silently corrupts the document.
    expect(r.config).toEqual({ font: 'grotesk', density: 'compact', paper: 'legal' });
  });

  it('is deterministic and idempotent: re-resolving its own config changes nothing', () => {
    for (const t of RESUME_TEMPLATES) {
      const once = resolveResumeStyle(t.id, null);
      const twice = resolveResumeStyle(t.id, once.config);
      expect(twice.config).toEqual(once.config);
    }
  });

  it('never throws for any template and any garbage style', () => {
    for (const t of RESUME_TEMPLATES) {
      for (const raw of [null, undefined, {}, { font: 'x' }, 'nope', 7]) {
        expect(() => resolveResumeStyle(t.id, raw)).not.toThrow();
      }
    }
  });
});
