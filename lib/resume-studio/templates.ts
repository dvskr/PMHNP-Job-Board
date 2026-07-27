/**
 * Resume presentation registry: templates, typography, density, paper size.
 *
 * ONE source of truth consumed by BOTH the live preview
 * (components/resume-studio/ResumePreview.tsx, real CSS) and the PDF export
 * (lib/resume-studio/pdf.tsx, @react-pdf/renderer). If the two ever read
 * different numbers the preview stops being a preview, so every measurement
 * a renderer needs lives here in points (1pt = 1/72in) and is converted to
 * px for the web at 96dpi.
 *
 * Font policy: the preview renders the chosen web font, while the PDF maps it
 * to the closest standard PostScript family (Times-Roman / Helvetica). This is
 * deliberate, not a limitation: applicant tracking systems parse standard
 * families most reliably, and embedding webfonts would add a network fetch to
 * every export. The mapping is surfaced in the UI so the choice is honest.
 */

export type ResumeTemplateId = 'classic' | 'modern' | 'minimal' | 'enterprise' | 'executive';
export type ResumeFontId = 'plex-serif' | 'lora' | 'franklin' | 'grotesk';
export type ResumeDensityId = 'roomy' | 'compact';
export type ResumePaperId = 'letter' | 'legal';

export interface ResumeStyleConfig {
  font: ResumeFontId;
  density: ResumeDensityId;
  paper: ResumePaperId;
}

export const DEFAULT_STYLE: ResumeStyleConfig = {
  font: 'plex-serif',
  density: 'roomy',
  paper: 'letter',
};

/* ── Templates ─────────────────────────────────────────────────────────── */

export interface ResumeTemplate {
  id: ResumeTemplateId;
  label: string;
  blurb: string;
  /** Section headings: ruled underline, small caps, or a left accent bar. */
  headingStyle: 'rule' | 'caps' | 'bar';
  /** Render the name centered (classic resumes) or flush left (modern). */
  headerAlign: 'center' | 'left';
  /** Accent used for headings and rules. Empty string means "ink only". */
  accent: string;
  /** Preferred font when the user has not chosen one explicitly. */
  defaultFont: ResumeFontId;
}

export const RESUME_TEMPLATES: readonly ResumeTemplate[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Centered header with ruled section headings. The safest ATS shape.',
    headingStyle: 'rule',
    headerAlign: 'center',
    accent: '',
    defaultFont: 'plex-serif',
  },
  {
    id: 'modern',
    label: 'Modern',
    blurb: 'Left-aligned header, teal section headings, generous leading.',
    headingStyle: 'caps',
    headerAlign: 'left',
    accent: '#0d6b62',
    defaultFont: 'franklin',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    blurb: 'No rules or color. Type and whitespace only.',
    headingStyle: 'caps',
    headerAlign: 'left',
    accent: '',
    defaultFont: 'grotesk',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    blurb: 'Accent bar headings, tight leading, fits more per page.',
    headingStyle: 'bar',
    headerAlign: 'left',
    accent: '#4a7a8c',
    defaultFont: 'franklin',
  },
  {
    id: 'executive',
    label: 'Executive',
    blurb: 'Centered serif header with a heavy rule. Reads senior.',
    headingStyle: 'rule',
    headerAlign: 'center',
    accent: '#152623',
    defaultFont: 'lora',
  },
] as const;

export function getTemplate(id: string | null | undefined): ResumeTemplate {
  return RESUME_TEMPLATES.find((t) => t.id === id) ?? RESUME_TEMPLATES[0];
}

/* ── Typography ────────────────────────────────────────────────────────── */

export interface ResumeFont {
  id: ResumeFontId;
  label: string;
  /** CSS stack for the live preview. */
  cssStack: string;
  /** Closest standard family @react-pdf ships built in. */
  pdfFamily: 'Times-Roman' | 'Helvetica';
  /** Bold face name for the PDF. */
  pdfBold: 'Times-Bold' | 'Helvetica-Bold';
  serif: boolean;
}

export const RESUME_FONTS: readonly ResumeFont[] = [
  {
    id: 'plex-serif',
    label: 'Plex Serif',
    cssStack: "'IBM Plex Serif', Georgia, 'Times New Roman', serif",
    pdfFamily: 'Times-Roman',
    pdfBold: 'Times-Bold',
    serif: true,
  },
  {
    id: 'lora',
    label: 'Lora',
    cssStack: "var(--font-lora), Lora, Georgia, serif",
    pdfFamily: 'Times-Roman',
    pdfBold: 'Times-Bold',
    serif: true,
  },
  {
    id: 'franklin',
    label: 'Franklin',
    cssStack: "'Libre Franklin', 'Helvetica Neue', Arial, sans-serif",
    pdfFamily: 'Helvetica',
    pdfBold: 'Helvetica-Bold',
    serif: false,
  },
  {
    id: 'grotesk',
    label: 'Grotesk',
    cssStack: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif",
    pdfFamily: 'Helvetica',
    pdfBold: 'Helvetica-Bold',
    serif: false,
  },
] as const;

export function getFont(id: string | null | undefined): ResumeFont {
  return RESUME_FONTS.find((f) => f.id === id) ?? RESUME_FONTS[0];
}

/* ── Density ───────────────────────────────────────────────────────────── */

export interface ResumeDensity {
  id: ResumeDensityId;
  label: string;
  /** Body copy size in points. */
  bodyPt: number;
  namePt: number;
  headingPt: number;
  /** Unitless line-height multiplier. */
  lineHeight: number;
  /** Vertical gap between sections, in points. */
  sectionGapPt: number;
  /** Vertical gap between entries within a section, in points. */
  entryGapPt: number;
  /** Page margin in points. */
  marginPt: number;
}

export const RESUME_DENSITIES: readonly ResumeDensity[] = [
  {
    id: 'roomy',
    label: 'Roomy',
    bodyPt: 10.5,
    namePt: 21,
    headingPt: 11.5,
    lineHeight: 1.42,
    sectionGapPt: 13,
    entryGapPt: 8,
    marginPt: 48,
  },
  {
    id: 'compact',
    label: 'Compact',
    bodyPt: 9.5,
    namePt: 18,
    headingPt: 10.5,
    lineHeight: 1.28,
    sectionGapPt: 9,
    entryGapPt: 5.5,
    marginPt: 36,
  },
] as const;

export function getDensity(id: string | null | undefined): ResumeDensity {
  return RESUME_DENSITIES.find((d) => d.id === id) ?? RESUME_DENSITIES[0];
}

/* ── Paper ─────────────────────────────────────────────────────────────── */

export interface ResumePaper {
  id: ResumePaperId;
  label: string;
  /** @react-pdf page size keyword. */
  pdfSize: 'LETTER' | 'LEGAL';
  widthPt: number;
  heightPt: number;
}

export const RESUME_PAPERS: readonly ResumePaper[] = [
  { id: 'letter', label: 'Letter', pdfSize: 'LETTER', widthPt: 612, heightPt: 792 },
  { id: 'legal', label: 'Legal', pdfSize: 'LEGAL', widthPt: 612, heightPt: 1008 },
] as const;

export function getPaper(id: string | null | undefined): ResumePaper {
  return RESUME_PAPERS.find((p) => p.id === id) ?? RESUME_PAPERS[0];
}

/* ── Resolution ────────────────────────────────────────────────────────── */

/** Points to CSS pixels at 96dpi, rounded to 2dp for stable rendering. */
export function ptToPx(pt: number): number {
  return Math.round((pt * 96) / 72 * 100) / 100;
}

/**
 * Normalize whatever is stored in ResumeDocument.styleConfig (unknown JSON)
 * into a complete, valid config. Unknown or missing values fall back to the
 * template's defaults, so a document saved before this feature existed still
 * renders correctly.
 */
export function resolveStyle(
  raw: unknown,
  templateId: string | null | undefined,
): ResumeStyleConfig {
  const template = getTemplate(templateId);
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const font = RESUME_FONTS.some((f) => f.id === source.font)
    ? (source.font as ResumeFontId)
    : template.defaultFont;
  const density = RESUME_DENSITIES.some((d) => d.id === source.density)
    ? (source.density as ResumeDensityId)
    : DEFAULT_STYLE.density;
  const paper = RESUME_PAPERS.some((p) => p.id === source.paper)
    ? (source.paper as ResumePaperId)
    : DEFAULT_STYLE.paper;
  return { font, density, paper };
}

/** Everything a renderer needs, resolved in one call. */
export interface ResolvedResumeStyle {
  template: ResumeTemplate;
  font: ResumeFont;
  density: ResumeDensity;
  paper: ResumePaper;
  config: ResumeStyleConfig;
}

export function resolveResumeStyle(
  templateId: string | null | undefined,
  rawStyle: unknown,
): ResolvedResumeStyle {
  const config = resolveStyle(rawStyle, templateId);
  return {
    template: getTemplate(templateId),
    font: getFont(config.font),
    density: getDensity(config.density),
    paper: getPaper(config.paper),
    config,
  };
}
