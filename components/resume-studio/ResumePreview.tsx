'use client';

/**
 * Live paper preview (components/resume-studio/ResumePreview.tsx)
 *
 * A real sheet of paper on screen, re-rendered on every keystroke. This is the
 * screen twin of the PDF export: both read the SAME registry
 * (lib/resume-studio/templates.ts) through resolveResumeStyle() and ptToPx(),
 * so margins, type scale, section order, and heading treatment cannot drift
 * apart. No pixel value that the PDF also renders is written literally here.
 *
 * Purely presentational: no fetching, no mutation, no persistence. The parent
 * owns the recessed well this sheet floats on; the component contributes only
 * the sheet, its scaling wrapper, and the page break guides.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import {
  ptToPx,
  resolveResumeStyle,
} from '@/lib/resume-studio/templates';
import type {
  ResolvedResumeStyle,
  ResumeStyleConfig,
} from '@/lib/resume-studio/templates';
import type {
  ResumeEducation,
  ResumeExperience,
  ResumeSections,
} from '@/lib/resume-studio/sections';
import {
  studioColors,
  studioFontStack,
  studioMonoStack,
  studioShadow,
} from '@/lib/resume-studio/design';

/* ── Props ─────────────────────────────────────────────────────────────── */

export interface ResumePreviewProps {
  sections: ResumeSections;
  templateId: string;
  style: ResumeStyleConfig;
  className?: string;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

/** Scale bounds for the sheet. Below 0.30 the type stops being readable, and
 *  above 1 the sheet would render larger than real paper. */
const MIN_SCALE = 0.3;
const MAX_SCALE = 1;

/** Subpixel slack before a taller-than-one-page sheet earns a second page. */
const PAGE_OVERFLOW_TOLERANCE_PX = 1;

/**
 * Ornament metrics: rules, bands, bullet indents, and the gap under a section
 * heading. These are decorative chrome with no counterpart in the PDF's point
 * geometry, so they stay fixed CSS pixels (values from the redesign spec 2.12)
 * rather than being derived from the density registry. Everything the PDF also
 * renders comes from ptToPx() instead.
 */
const ornament = {
  headingRulePad: 3,
  headingGap: 8,
  headingGapTight: 7,
  headingBarWidth: 3,
  headingBarPad: 9,
  headerRuleGap: 12,
  headerGap: 14,
  headerGapWide: 16,
  bandPadding: '16px 18px',
  bandRadius: 8,
  credentialGap: 2,
  contactGap: 6,
  bulletListGap: 5,
  bulletIndent: 17,
  bulletGap: 2,
  entryLineGap: 3,
  sheetRadius: 3,
  guideLabelSize: 10,
  guideLabelOffset: 4,
} as const;

/**
 * Two preview inks the shared token set does not carry. Kept local and named
 * so no raw hex appears inside the markup below.
 */
const previewInk = {
  /** Ghost placeholder copy: legible, never italic, never faded. */
  ghost: '#9aa39f',
  /** Date range beside a role title: quieter than body copy, still readable. */
  dates: '#7a857f',
} as const;

/* ── Derivation helpers ────────────────────────────────────────────────── */

function joinParts(parts: string[], separator = ', '): string {
  return parts.map((part) => part.trim()).filter((part) => part.length > 0).join(separator);
}

function experienceDateRange(role: ResumeExperience): string {
  const end = role.isCurrent ? 'Present' : role.endDate.trim();
  const start = role.startDate.trim();
  if (start && end) return `${start} to ${end}`;
  return start || end || '';
}

function educationDegreeLine(entry: ResumeEducation): string {
  return entry.fieldOfStudy.trim()
    ? joinParts([entry.degreeType, entry.fieldOfStudy], ' in ')
    : entry.degreeType.trim();
}

interface PreviewExperience {
  title: string;
  dates: string;
  employer: string;
  bullets: string[];
}

interface PreviewEducation {
  degree: string;
  school: string;
}

interface PreviewModel {
  isEmpty: boolean;
  name: string;
  credential: string;
  contactLine: string;
  summary: string;
  licenseLines: string[];
  certificationLines: string[];
  education: PreviewEducation[];
  experience: PreviewExperience[];
  skillsLine: string;
}

/**
 * The credential under the name is derived, never stored: ResumeSections has no
 * credential field and the shared contract is not being changed. First
 * certification wins, otherwise the first license plus its state.
 */
function credentialLine(sections: ResumeSections): string {
  const certification = sections.certifications.find((entry) => entry.name.trim().length > 0);
  if (certification) return certification.name.trim();
  const license = sections.licenses.find((entry) => entry.licenseType.trim().length > 0);
  if (!license) return '';
  return joinParts([license.licenseType, license.licenseState]);
}

/** Flatten ResumeSections into exactly what the sheet paints. */
function buildModel(sections: ResumeSections): PreviewModel {
  const { contact } = sections;

  const contactLine = joinParts(
    [
      contact.email,
      contact.phone,
      joinParts([contact.city, contact.state]),
      contact.linkedinUrl,
    ],
    ' | ',
  );

  const licenseLines = sections.licenses
    .map((license) =>
      joinParts([
        license.licenseType,
        license.licenseState,
        license.licenseNumber.trim() ? `License ${license.licenseNumber.trim()}` : '',
        license.expiration.trim() ? `Expires ${license.expiration.trim()}` : '',
      ]),
    )
    .filter((line) => line.length > 0);

  const certificationLines = sections.certifications
    .map((certification) =>
      joinParts([
        certification.name,
        certification.certifyingBody,
        certification.expiration.trim() ? `Expires ${certification.expiration.trim()}` : '',
      ]),
    )
    .filter((line) => line.length > 0);

  const education = sections.education
    .map((entry) => ({
      degree: educationDegreeLine(entry),
      school: joinParts([entry.schoolName, entry.graduationYear]),
    }))
    .filter((entry) => entry.degree.length > 0 || entry.school.length > 0);

  const experience = sections.experience
    .map((role) => ({
      title: role.jobTitle.trim(),
      dates: experienceDateRange(role),
      employer: joinParts([role.employerName, role.location]),
      bullets: role.bullets.map((bullet) => bullet.trim()).filter((bullet) => bullet.length > 0),
    }))
    .filter(
      (role) =>
        role.title.length > 0 ||
        role.employer.length > 0 ||
        role.bullets.length > 0,
    );

  const skillsLine = joinParts(sections.skills);
  const name = contact.fullName.trim();
  const summary = sections.summary.trim();

  return {
    isEmpty:
      name.length === 0 &&
      contactLine.length === 0 &&
      summary.length === 0 &&
      licenseLines.length === 0 &&
      certificationLines.length === 0 &&
      education.length === 0 &&
      experience.length === 0 &&
      skillsLine.length === 0,
    name,
    credential: credentialLine(sections),
    contactLine,
    summary,
    licenseLines,
    certificationLines,
    education,
    experience,
    skillsLine,
  };
}

/* ── Style derivation (every number below comes from the registry) ─────── */

interface SheetMetrics {
  paperWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
  bodyPx: number;
  namePx: number;
  headingPx: number;
  credentialPx: number;
  contactPx: number;
  datesPx: number;
  employerPx: number;
  sectionGapPx: number;
  entryGapPx: number;
  lineHeight: number;
  accent: string;
  nameColor: string;
  credentialColor: string;
  contactColor: string;
}

/** Templates with an empty accent print in ink, which is the ATS-safest look. */
function accentOf(resolved: ResolvedResumeStyle): string {
  return resolved.template.accent || studioColors.ink;
}

function buildMetrics(resolved: ResolvedResumeStyle): SheetMetrics {
  const { density, paper, template } = resolved;
  const accent = accentOf(resolved);
  const isBand = template.id === 'enterprise';

  return {
    paperWidthPx: ptToPx(paper.widthPt),
    pageHeightPx: ptToPx(paper.heightPt),
    marginPx: ptToPx(density.marginPt),
    bodyPx: ptToPx(density.bodyPt),
    namePx: ptToPx(density.namePt),
    headingPx: ptToPx(
      template.id === 'minimal' ? density.headingPt - 0.5 : density.headingPt,
    ),
    credentialPx: ptToPx(density.bodyPt + 1),
    contactPx: ptToPx(density.bodyPt - 1),
    datesPx: ptToPx(density.bodyPt - 1.5),
    employerPx: ptToPx(density.bodyPt - 0.5),
    sectionGapPx: ptToPx(density.sectionGapPt),
    entryGapPx: ptToPx(density.entryGapPt),
    lineHeight: density.lineHeight,
    accent,
    nameColor: isBand
      ? '#ffffff'
      : template.id === 'modern'
        ? accent
        : studioColors.ink,
    credentialColor: isBand ? 'rgba(255,255,255,.92)' : accent,
    contactColor: isBand ? 'rgba(255,255,255,.85)' : studioColors.textSoft,
  };
}

function buildHeaderStyle(
  resolved: ResolvedResumeStyle,
  metrics: SheetMetrics,
): CSSProperties {
  const { accent } = metrics;
  switch (resolved.template.id) {
    case 'modern':
      return {
        textAlign: 'left',
        paddingBottom: ornament.headerRuleGap,
        marginBottom: ornament.headerGap,
      };
    case 'minimal':
      return {
        textAlign: 'left',
        borderBottom: `1px solid ${studioColors.border}`,
        paddingBottom: ornament.headerRuleGap,
        marginBottom: ornament.headerGap,
      };
    case 'enterprise':
      return {
        textAlign: 'left',
        background: accent,
        padding: ornament.bandPadding,
        borderRadius: ornament.bandRadius,
        marginBottom: ornament.headerGapWide,
      };
    case 'executive':
      return {
        textAlign: 'center',
        borderTop: `1.5px solid ${accent}`,
        borderBottom: `1.5px solid ${accent}`,
        padding: `${ornament.headerRuleGap}px 0`,
        marginBottom: ornament.headerGap,
      };
    case 'classic':
    default:
      return {
        textAlign: 'center',
        borderBottom: `2px solid ${accent}`,
        paddingBottom: ornament.headerRuleGap,
        marginBottom: ornament.headerGap,
      };
  }
}

function buildHeadingStyle(
  resolved: ResolvedResumeStyle,
  metrics: SheetMetrics,
): CSSProperties {
  const { accent, headingPx } = metrics;
  const base: CSSProperties = {
    fontFamily: resolved.font.cssStack,
    fontSize: headingPx,
    fontWeight: 600,
    textTransform: 'uppercase',
    color: accent,
  };

  switch (resolved.template.id) {
    case 'modern':
      return {
        ...base,
        letterSpacing: '.8px',
        borderLeft: `${ornament.headingBarWidth}px solid ${accent}`,
        paddingLeft: ornament.headingBarPad,
        marginBottom: ornament.headingGap,
      };
    case 'minimal':
      return {
        fontFamily: studioFontStack,
        fontSize: headingPx,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '2px',
        color: studioColors.textFaint,
        marginBottom: ornament.headingGapTight,
      };
    case 'enterprise':
      return {
        ...base,
        letterSpacing: '1.2px',
        borderBottom: `2px solid ${accent}`,
        paddingBottom: ornament.headingRulePad,
        marginBottom: ornament.headingGap,
      };
    case 'executive':
      return {
        ...base,
        letterSpacing: '1.6px',
        borderBottom: `1px solid ${studioColors.border}`,
        paddingBottom: ornament.headingRulePad,
        marginBottom: ornament.headingGap,
      };
    case 'classic':
    default:
      return {
        ...base,
        letterSpacing: '1px',
        borderBottom: `1px solid ${studioColors.border}`,
        paddingBottom: ornament.headingRulePad,
        marginBottom: ornament.headingGap,
      };
  }
}

/* ── Measurement ───────────────────────────────────────────────────────── */

/** useLayoutEffect on the client, useEffect on the server render pass. */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Track the content box width of an element. Returns null until the first
 * measurement lands, which is the cue to keep the sheet out of layout so a
 * full size sheet never flashes wider than its well.
 */
function useContainerWidth(ref: RefObject<HTMLDivElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    let observer: ResizeObserver | null = null;

    if (element) {
      const measure = () => {
        const next = element.clientWidth;
        if (next > 0) setWidth(next);
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(element);
      }
    }

    return () => {
      observer?.disconnect();
    };
  }, [ref]);

  return width;
}

/** Track the rendered height of the sheet's content column. */
function useContentHeight(ref: RefObject<HTMLDivElement | null>): number {
  const [height, setHeight] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    let observer: ResizeObserver | null = null;

    if (element) {
      const measure = () => setHeight(element.offsetHeight);
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(element);
      }
    }

    return () => {
      observer?.disconnect();
    };
  }, [ref]);

  return height;
}

/* ── Sheet pieces ──────────────────────────────────────────────────────── */

function PreviewSection({
  title,
  headingStyle,
  marginBottom,
  children,
}: {
  title: string;
  headingStyle: CSSProperties;
  marginBottom: number;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom }}>
      <h3 style={headingStyle}>{title}</h3>
      {children}
    </section>
  );
}

function ExperienceEntry({
  role,
  metrics,
  marginBottom,
}: {
  role: PreviewExperience;
  metrics: SheetMetrics;
  marginBottom: number;
}) {
  return (
    <div style={{ marginBottom }}>
      {(role.title || role.dates) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: ornament.headingGap,
          }}
        >
          <span style={{ fontWeight: 600, color: studioColors.ink }}>{role.title}</span>
          {role.dates && (
            <span
              style={{
                fontSize: metrics.datesPx,
                color: previewInk.dates,
                whiteSpace: 'nowrap',
              }}
            >
              {role.dates}
            </span>
          )}
        </div>
      )}
      {role.employer && (
        <div
          style={{
            fontSize: metrics.employerPx,
            fontWeight: 500,
            color: metrics.accent,
          }}
        >
          {role.employer}
        </div>
      )}
      {role.bullets.length > 0 && (
        <ul
          style={{
            margin: `${ornament.bulletListGap}px 0 0`,
            paddingLeft: ornament.bulletIndent,
            listStyleType: 'disc',
            lineHeight: metrics.lineHeight,
          }}
        >
          {role.bullets.map((bullet, index) => (
            <li key={index} style={{ marginBottom: ornament.bulletGap }}>
              {bullet}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Dashed rules at every page boundary, drawn outside the scale transform so
 * the labels stay legible at any zoom. Decorative: hidden from assistive tech
 * (the page count is announced through the sheet's label instead) and absent
 * from the PDF.
 */
function PageGuides({
  pageCount,
  pageHeightPx,
  scale,
}: {
  pageCount: number;
  pageHeightPx: number;
  scale: number;
}) {
  if (pageCount < 2) return null;

  return (
    <>
      {Array.from({ length: pageCount - 1 }, (_, index) => {
        const top = pageHeightPx * (index + 1) * scale;
        return (
          <div
            key={index}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top,
              borderTop: `1px dashed ${studioColors.border}`,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <span
              style={{
                position: 'absolute',
                right: 0,
                bottom: ornament.guideLabelOffset,
                fontFamily: studioMonoStack,
                fontSize: ornament.guideLabelSize,
                color: studioColors.textFaint,
              }}
            >
              Page {index + 2}
            </span>
          </div>
        );
      })}
    </>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function ResumePreview({
  sections,
  templateId,
  style,
  className,
}: ResumePreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const resolved = useMemo(
    () => resolveResumeStyle(templateId, style),
    [templateId, style],
  );
  const metrics = useMemo(() => buildMetrics(resolved), [resolved]);
  const headerStyle = useMemo(() => buildHeaderStyle(resolved, metrics), [resolved, metrics]);
  const headingStyle = useMemo(() => buildHeadingStyle(resolved, metrics), [resolved, metrics]);
  const model = useMemo(() => buildModel(sections), [sections]);

  const availableWidth = useContainerWidth(rootRef);
  const contentHeight = useContentHeight(contentRef);

  const scale =
    availableWidth === null
      ? null
      : Math.min(MAX_SCALE, Math.max(MIN_SCALE, availableWidth / metrics.paperWidthPx));

  const filledHeight = contentHeight + metrics.marginPx * 2;
  const pageCount = Math.max(
    1,
    Math.ceil((filledHeight - PAGE_OVERFLOW_TOLERANCE_PX) / metrics.pageHeightPx),
  );
  const sheetHeight = pageCount * metrics.pageHeightPx;

  /* Sections are omitted entirely when empty, so no bare heading ever prints.
     Order matches lib/resume-studio/pdf.tsx and sectionsToText(). */
  const blocks: { key: string; title: string; body: ReactNode }[] = [];

  if (model.summary) {
    blocks.push({
      key: 'summary',
      title: 'Summary',
      body: (
        <p style={{ margin: 0, lineHeight: metrics.lineHeight, color: studioColors.textStrong }}>
          {model.summary}
        </p>
      ),
    });
  }

  if (model.licenseLines.length > 0) {
    blocks.push({
      key: 'licenses',
      title: 'Licenses',
      body: (
        <div style={{ lineHeight: metrics.lineHeight }}>
          {model.licenseLines.map((line, index) => (
            <div key={index} style={{ marginBottom: ornament.entryLineGap }}>
              {line}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (model.certificationLines.length > 0) {
    blocks.push({
      key: 'certifications',
      title: 'Certifications',
      body: (
        <div style={{ lineHeight: metrics.lineHeight }}>
          {model.certificationLines.map((line, index) => (
            <div key={index} style={{ marginBottom: ornament.entryLineGap }}>
              {line}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (model.education.length > 0) {
    blocks.push({
      key: 'education',
      title: 'Education',
      body: (
        <div style={{ lineHeight: metrics.lineHeight }}>
          {model.education.map((entry, index) => (
            <div
              key={index}
              style={{
                marginBottom:
                  index === model.education.length - 1 ? 0 : metrics.entryGapPx,
              }}
            >
              {entry.degree && (
                <div style={{ fontWeight: 600, color: studioColors.ink }}>{entry.degree}</div>
              )}
              {entry.school && <div>{entry.school}</div>}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (model.experience.length > 0) {
    blocks.push({
      key: 'experience',
      title: 'Experience',
      body: (
        <div>
          {model.experience.map((role, index) => (
            <ExperienceEntry
              key={index}
              role={role}
              metrics={metrics}
              marginBottom={index === model.experience.length - 1 ? 0 : metrics.entryGapPx}
            />
          ))}
        </div>
      ),
    });
  }

  if (model.skillsLine) {
    blocks.push({
      key: 'skills',
      title: 'Skills',
      body: <div style={{ lineHeight: metrics.lineHeight }}>{model.skillsLine}</div>,
    });
  }

  const sheetLabel = model.name
    ? `Resume preview for ${model.name}`
    : 'Resume preview, no name entered yet';
  const pageLabel = pageCount === 1 ? '1 page' : `${pageCount} pages`;

  return (
    <div ref={rootRef} className={className} style={{ width: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: scale === null ? '100%' : metrics.paperWidthPx * scale,
          height: scale === null ? 0 : sheetHeight * scale,
          margin: '0 auto',
          visibility: scale === null ? 'hidden' : 'visible',
          overflow: scale === null ? 'hidden' : 'visible',
        }}
      >
        <div
          role="document"
          aria-label={`${sheetLabel}, ${pageLabel}`}
          style={{
            boxSizing: 'border-box',
            width: metrics.paperWidthPx,
            minHeight: metrics.pageHeightPx,
            height: sheetHeight,
            padding: metrics.marginPx,
            background: '#ffffff',
            borderRadius: ornament.sheetRadius,
            boxShadow: studioShadow.paper,
            fontFamily: resolved.font.cssStack,
            fontSize: metrics.bodyPx,
            lineHeight: metrics.lineHeight,
            color: studioColors.textStrong,
            overflowWrap: 'break-word',
            transform: `scale(${scale ?? MAX_SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          <div ref={contentRef}>
            <header style={headerStyle}>
              <div
                style={{
                  fontFamily: resolved.font.cssStack,
                  fontWeight: 600,
                  fontSize: metrics.namePx,
                  letterSpacing: '-.3px',
                  color: model.name ? metrics.nameColor : previewInk.ghost,
                }}
                aria-hidden={model.name ? undefined : true}
              >
                {model.name || 'Your Name'}
              </div>
              {model.credential && (
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: metrics.credentialPx,
                    marginTop: ornament.credentialGap,
                    color: metrics.credentialColor,
                  }}
                >
                  {model.credential}
                </div>
              )}
              {model.contactLine && (
                <div
                  style={{
                    fontSize: metrics.contactPx,
                    marginTop: ornament.contactGap,
                    color: metrics.contactColor,
                  }}
                >
                  {model.contactLine}
                </div>
              )}
            </header>

            {model.isEmpty ? (
              <p
                aria-hidden="true"
                style={{
                  margin: 0,
                  lineHeight: metrics.lineHeight,
                  color: previewInk.ghost,
                }}
              >
                Your summary will appear here as you type.
              </p>
            ) : (
              blocks.map((block, index) => (
                <PreviewSection
                  key={block.key}
                  title={block.title}
                  headingStyle={headingStyle}
                  marginBottom={index === blocks.length - 1 ? 0 : metrics.sectionGapPx}
                >
                  {block.body}
                </PreviewSection>
              ))
            )}
          </div>
        </div>

        {scale !== null && (
          <PageGuides
            pageCount={pageCount}
            pageHeightPx={metrics.pageHeightPx}
            scale={scale}
          />
        )}
      </div>
    </div>
  );
}
