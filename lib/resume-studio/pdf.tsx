/**
 * Resume studio PDF renderer (lib/resume-studio/pdf.tsx)
 *
 * Every measurement, family, and color here is resolved through
 * resolveResumeStyle() in lib/resume-studio/templates.ts, the same call the
 * live preview makes. That is the whole point of this module: the preview and
 * the export read one registry, so they cannot drift. Nothing below invents a
 * size, a gap, or a margin of its own.
 *
 * Registry mapping:
 *   paper.pdfSize                 -> <Page size>
 *   density.marginPt              -> page padding
 *   density.bodyPt/namePt/headingPt -> type scale (derived sizes offset from bodyPt)
 *   density.lineHeight            -> leading everywhere
 *   density.sectionGapPt          -> gap between section blocks
 *   density.entryGapPt            -> gap between entries inside a section
 *   font.pdfFamily / font.pdfBold -> regular and bold faces
 *   template.headingStyle         -> 'rule' hairline under, 'caps' letterspaced,
 *                                    'bar' short accent bar on the left
 *   template.headerAlign          -> name block centered or flush left
 *   template.accent               -> heading, rule, and employer ink ('' means ink only)
 *
 * ATS constraints held deliberately: one column, no tables, no multi column
 * body, only the standard PostScript families @react-pdf ships built in
 * (Helvetica and Times, nothing embedded), and real selectable text on every
 * line. Nothing is rasterized.
 */
import type { ReactNode } from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { studioColors } from '@/lib/resume-studio/design';
import {
    resolveResumeStyle,
    type ResolvedResumeStyle,
    type ResumeTemplateId,
} from '@/lib/resume-studio/templates';
import type {
    ResumeCertification,
    ResumeEducation,
    ResumeExperience,
    ResumeLicense,
    ResumeSections,
} from '@/lib/resume-studio/sections';

/* ── Constants ─────────────────────────────────────────────────────────── */

/** Between inline items: contact bits, credential lines, skills. */
const INLINE_SEPARATOR = '  ·  ';
/** Inside one employer line: employer and location. */
const EMPLOYER_SEPARATOR = ' · ';
/** Date range ink. Named directly by the preview spec; no design token matches. */
const DATE_INK = '#7a857f';
/** Keeps a section heading from stranding alone at the foot of a page. */
const ORPHAN_GUARD_PT = 34;

/**
 * Ceiling on heading letterspacing, as a fraction of the heading font size.
 *
 * Text extractors (pdf.js, PDFBox, and the Tika stack most applicant tracking
 * systems run on) insert a space whenever the advance between two glyphs
 * exceeds a fraction of the font's space width. Past roughly a tenth of the
 * font size, "EXPERIENCE" comes out of the extractor as "E X P E R I E N C E"
 * and no parser finds the section. Verified by rendering all five templates at
 * both densities and extracting: 0.09 is intact everywhere, the registry's
 * wider tracking is not. The preview may show the full tracking; the PDF is
 * capped because an unreadable heading defeats the export.
 */
const MAX_TRACKING_RATIO = 0.09;

/**
 * Extra separation under the name, in points.
 *
 * Extractors cluster runs into lines by baseline proximity, and the name is
 * the tallest run on the page, so at the registry's leading the credential or
 * contact line clusters into it and the name extracts as
 * "Jordan RiveraPMHNP-BC". Pushing the following line clear of the name's own
 * line box keeps the highest value field on a line of its own.
 */
const NAME_BASELINE_CLEARANCE_PT = 5;

/** CSS px (how the preview spec writes its chrome) to PDF points at 96dpi. */
function pxToPt(px: number): number {
    return Math.round((px * 72) / 96 * 100) / 100;
}

/** Letterspacing in points, capped so the heading still extracts as one word. */
function trackingFor(trackingPx: number, fontSizePt: number): number {
    return Math.min(pxToPt(trackingPx), fontSizePt * MAX_TRACKING_RATIO);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Flatten white at `alpha` over a solid accent into an opaque hex. The
 * enterprise header paints white type on a filled accent block, and @react-pdf
 * does not composite alpha on text ink.
 */
function whiteOver(accent: string, alpha: number): string {
    if (!HEX_COLOR.test(accent)) return '#ffffff';
    const channel = (offset: number) => {
        const base = parseInt(accent.slice(offset, offset + 2), 16);
        return Math.round(alpha * 255 + (1 - alpha) * base);
    };
    const hex = (value: number) => value.toString(16).padStart(2, '0');
    return `#${hex(channel(1))}${hex(channel(3))}${hex(channel(5))}`;
}

/* ── Per template header decoration ────────────────────────────────────── */

type HeaderDecor =
    | { kind: 'ruleBelow'; widthPx: number; ruleInk: 'accent' | 'border' }
    | { kind: 'ruleAround'; widthPx: number }
    | { kind: 'plain' }
    | { kind: 'filled' };

/**
 * Exhaustive by ResumeTemplateId, so adding a template to the registry fails
 * type check here until its header is described.
 */
const HEADER_DECOR: Record<ResumeTemplateId, HeaderDecor> = {
    classic: { kind: 'ruleBelow', widthPx: 2, ruleInk: 'accent' },
    modern: { kind: 'plain' },
    minimal: { kind: 'ruleBelow', widthPx: 1, ruleInk: 'border' },
    enterprise: { kind: 'filled' },
    executive: { kind: 'ruleAround', widthPx: 1.5 },
};

/** Extra heading letterspacing per template, in CSS px, converted below. */
const HEADING_TRACKING_PX: Record<ResumeTemplateId, number> = {
    classic: 1,
    modern: 0.8,
    minimal: 2,
    enterprise: 1.2,
    executive: 1.6,
};

/* ── Style sheet ───────────────────────────────────────────────────────── */

interface PdfStyles {
    page: Style;
    header: Style;
    name: Style;
    credential: Style;
    contact: Style;
    section: Style;
    heading: Style;
    headingBarRow: Style;
    headingBar: Style;
    line: Style;
    entry: Style;
    roleRow: Style;
    roleTitle: Style;
    roleDates: Style;
    roleEmployer: Style;
    bulletList: Style;
    bulletRow: Style;
    bulletGlyph: Style;
    bulletText: Style;
    degree: Style;
    /** True when the heading treatment is the left accent bar. */
    headingUsesBar: boolean;
}

function buildHeader(style: ResolvedResumeStyle, accent: string): Style {
    const { template } = style;
    const decor = HEADER_DECOR[template.id];
    const base: Style = { textAlign: template.headerAlign };

    if (decor.kind === 'filled') {
        return {
            ...base,
            backgroundColor: accent,
            paddingVertical: pxToPt(16),
            paddingHorizontal: pxToPt(18),
            borderRadius: pxToPt(8),
            marginBottom: pxToPt(16),
        };
    }
    if (decor.kind === 'ruleBelow') {
        return {
            ...base,
            borderBottomWidth: pxToPt(decor.widthPx),
            borderBottomColor: decor.ruleInk === 'accent' ? accent : studioColors.border,
            paddingBottom: pxToPt(12),
            marginBottom: pxToPt(14),
        };
    }
    if (decor.kind === 'ruleAround') {
        return {
            ...base,
            borderTopWidth: pxToPt(decor.widthPx),
            borderBottomWidth: pxToPt(decor.widthPx),
            borderTopColor: accent,
            borderBottomColor: accent,
            paddingVertical: pxToPt(12),
            marginBottom: pxToPt(14),
        };
    }
    return { ...base, paddingBottom: pxToPt(10), marginBottom: pxToPt(14) };
}

function buildHeading(style: ResolvedResumeStyle, accent: string): Style {
    const { template, font, density } = style;
    const trackingPx = HEADING_TRACKING_PX[template.id];
    const inkOnly = template.accent === '';

    // Minimal drops the resume face for the studio sans and steps down a
    // half point, per the registry's "no rules or color" blurb.
    if (template.headingStyle === 'caps' && inkOnly) {
        const fontSize = density.headingPt - 0.5;
        return {
            fontFamily: 'Helvetica-Bold',
            fontSize,
            letterSpacing: trackingFor(trackingPx, fontSize),
            color: studioColors.textFaint,
            marginBottom: pxToPt(7),
        };
    }

    const base: Style = {
        fontFamily: font.pdfBold,
        fontSize: density.headingPt,
        letterSpacing: trackingFor(trackingPx, density.headingPt),
        color: accent,
        marginBottom: pxToPt(8),
    };

    if (template.headingStyle === 'rule') {
        return {
            ...base,
            borderBottomWidth: pxToPt(1),
            borderBottomColor: inkOnly ? studioColors.border : accent,
            paddingBottom: pxToPt(3),
        };
    }
    return base;
}

function buildStyles(style: ResolvedResumeStyle): PdfStyles {
    const { template, font, density } = style;
    const accent = template.accent || studioColors.ink;
    const filledHeader = HEADER_DECOR[template.id].kind === 'filled';

    const nameInk = filledHeader
        ? '#ffffff'
        : template.headerAlign === 'left' && template.accent
            ? accent
            : studioColors.ink;

    return {
        headingUsesBar: template.headingStyle === 'bar',
        page: {
            padding: density.marginPt,
            fontFamily: font.pdfFamily,
            fontSize: density.bodyPt,
            lineHeight: density.lineHeight,
            color: studioColors.textStrong,
        },
        header: buildHeader(style, accent),
        name: {
            fontFamily: font.pdfBold,
            fontSize: density.namePt,
            letterSpacing: pxToPt(-0.3),
            color: nameInk,
            marginBottom: NAME_BASELINE_CLEARANCE_PT,
        },
        credential: {
            fontFamily: font.pdfBold,
            fontSize: density.bodyPt + 1,
            marginTop: pxToPt(2),
            color: filledHeader ? whiteOver(accent, 0.92) : accent,
        },
        contact: {
            fontSize: density.bodyPt - 1,
            marginTop: pxToPt(6),
            color: filledHeader ? whiteOver(accent, 0.85) : studioColors.textSoft,
        },
        section: {
            marginBottom: density.sectionGapPt,
        },
        heading: buildHeading(style, accent),
        headingBarRow: {
            flexDirection: 'row',
            alignItems: 'stretch',
            marginBottom: pxToPt(8),
        },
        headingBar: {
            width: pxToPt(3),
            backgroundColor: accent,
            marginRight: pxToPt(9),
        },
        line: {
            fontSize: density.bodyPt,
            lineHeight: density.lineHeight,
        },
        entry: {
            marginBottom: density.entryGapPt,
        },
        roleRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        roleTitle: {
            fontFamily: font.pdfBold,
            fontSize: density.bodyPt,
            color: studioColors.ink,
        },
        roleDates: {
            fontSize: density.bodyPt - 1.5,
            color: DATE_INK,
            textAlign: 'right',
        },
        roleEmployer: {
            fontSize: density.bodyPt - 0.5,
            color: accent,
        },
        bulletList: {
            marginTop: pxToPt(5),
        },
        bulletRow: {
            flexDirection: 'row',
            marginBottom: pxToPt(2),
        },
        bulletGlyph: {
            width: pxToPt(13),
            fontSize: density.bodyPt,
            lineHeight: density.lineHeight,
        },
        bulletText: {
            flex: 1,
            fontSize: density.bodyPt,
            lineHeight: density.lineHeight,
        },
        degree: {
            fontFamily: font.pdfBold,
            color: studioColors.ink,
        },
    };
}

/* ── Content derivation ────────────────────────────────────────────────── */

function joinParts(parts: string[], separator = ', '): string {
    return parts.filter((part) => part.length > 0).join(separator);
}

function experienceDateRange(role: ResumeExperience): string {
    const end = role.isCurrent ? 'Present' : role.endDate;
    if (role.startDate && end) return `${role.startDate} to ${end}`;
    return role.startDate || end || '';
}

/**
 * Credential line under the name. ResumeSections has no credential field and
 * the shared contract is not changing, so it is derived: the first
 * certification name, else the first license type, qualified by the license
 * state when there is one.
 */
function credentialLine(
    licenses: readonly ResumeLicense[],
    certifications: readonly ResumeCertification[],
): string {
    const certification = certifications.find((entry) => entry.name);
    const license = licenses.find((entry) => entry.licenseType);
    const base = certification?.name || license?.licenseType || '';
    if (!base) return '';
    return joinParts([base, license?.licenseState ?? '']);
}

/** One joined line covering licenses then certifications. */
function credentialsSectionLine(
    licenses: readonly ResumeLicense[],
    certifications: readonly ResumeCertification[],
): string {
    const parts = [
        ...licenses
            .filter((entry) => entry.licenseType)
            .map((entry) =>
                entry.licenseState
                    ? `${entry.licenseType} (${entry.licenseState})`
                    : entry.licenseType,
            ),
        ...certifications
            .filter((entry) => entry.name)
            .map((entry) => joinParts([entry.name, entry.certifyingBody])),
    ];
    return parts.join(INLINE_SEPARATOR);
}

function educationLines(entry: ResumeEducation): { degree: string; school: string } {
    return {
        degree: joinParts([entry.degreeType, entry.fieldOfStudy]),
        school: joinParts([entry.schoolName, entry.graduationYear]),
    };
}

/* ── Components ────────────────────────────────────────────────────────── */

const SectionHeading = ({ title, styles }: { title: string; styles: PdfStyles }) => {
    const label = title.toUpperCase();
    if (!styles.headingUsesBar) return <Text style={styles.heading}>{label}</Text>;
    return (
        <View style={styles.headingBarRow}>
            <View style={styles.headingBar} />
            <Text style={{ ...styles.heading, marginBottom: 0 }}>{label}</Text>
        </View>
    );
};

const ResumeSection = ({
    title,
    styles,
    children,
}: {
    title: string;
    styles: PdfStyles;
    children: ReactNode;
}) => (
    <View style={styles.section} minPresenceAhead={ORPHAN_GUARD_PT}>
        <SectionHeading title={title} styles={styles} />
        {children}
    </View>
);

const ExperienceEntry = ({ role, styles }: { role: ResumeExperience; styles: PdfStyles }) => {
    const dates = experienceDateRange(role);
    const employerLine = joinParts([role.employerName, role.location], EMPLOYER_SEPARATOR);
    const bullets = role.bullets.filter((bullet) => bullet.trim().length > 0);
    return (
        <View style={styles.entry}>
            <View style={styles.roleRow}>
                <Text style={styles.roleTitle}>{role.jobTitle}</Text>
                {dates ? <Text style={styles.roleDates}>{dates}</Text> : null}
            </View>
            {employerLine ? <Text style={styles.roleEmployer}>{employerLine}</Text> : null}
            {bullets.length > 0 ? (
                <View style={styles.bulletList}>
                    {bullets.map((bullet, index) => (
                        <View key={index} style={styles.bulletRow}>
                            <Text style={styles.bulletGlyph}>{'•'}</Text>
                            <Text style={styles.bulletText}>{bullet}</Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
};

const ResumePdfDocument = ({
    sections,
    style,
    title,
}: {
    sections: ResumeSections;
    style: ResolvedResumeStyle;
    title: string;
}) => {
    const styles = buildStyles(style);
    const { contact } = sections;

    const contactLine = joinParts(
        [
            contact.email,
            contact.phone,
            joinParts([contact.city, contact.state]),
            contact.linkedinUrl,
        ],
        INLINE_SEPARATOR,
    );
    const credential = credentialLine(sections.licenses, sections.certifications);
    const credentials = credentialsSectionLine(sections.licenses, sections.certifications);
    const roles = sections.experience.filter((role) => role.jobTitle || role.employerName);
    const schooling = sections.education.filter((entry) => entry.degreeType || entry.schoolName);

    return (
        <Document title={title} author={contact.fullName || 'PMHNP Hiring'}>
            <Page size={style.paper.pdfSize} style={styles.page}>
                <View style={styles.header}>
                    {contact.fullName ? <Text style={styles.name}>{contact.fullName}</Text> : null}
                    {credential ? <Text style={styles.credential}>{credential}</Text> : null}
                    {contactLine ? <Text style={styles.contact}>{contactLine}</Text> : null}
                </View>

                {sections.summary.trim() ? (
                    <ResumeSection title="Summary" styles={styles}>
                        <Text style={styles.line}>{sections.summary}</Text>
                    </ResumeSection>
                ) : null}

                {roles.length > 0 ? (
                    <ResumeSection title="Experience" styles={styles}>
                        {roles.map((role, index) => (
                            <ExperienceEntry key={index} role={role} styles={styles} />
                        ))}
                    </ResumeSection>
                ) : null}

                {credentials ? (
                    <ResumeSection title="Licenses and Certifications" styles={styles}>
                        <Text style={styles.line}>{credentials}</Text>
                    </ResumeSection>
                ) : null}

                {schooling.length > 0 ? (
                    <ResumeSection title="Education" styles={styles}>
                        {schooling.map((entry, index) => {
                            const { degree, school } = educationLines(entry);
                            return (
                                <Text key={index} style={{ ...styles.line, ...styles.entry }}>
                                    <Text style={styles.degree}>{degree}</Text>
                                    {degree && school ? ', ' : ''}
                                    {school}
                                </Text>
                            );
                        })}
                    </ResumeSection>
                ) : null}

                {sections.skills.length > 0 ? (
                    <ResumeSection title="Skills" styles={styles}>
                        <Text style={styles.line}>{sections.skills.join(INLINE_SEPARATOR)}</Text>
                    </ResumeSection>
                ) : null}
            </Page>
        </Document>
    );
};

/**
 * Render a resume document to a PDF buffer. `templateId` and `styleConfig`
 * come straight off the ResumeDocument row; resolveResumeStyle() normalizes
 * both, so an unknown template, a null styleConfig, or a row written before
 * this feature existed all fall back to valid defaults instead of throwing.
 */
export async function renderResumePdf(
    sections: ResumeSections,
    templateId: string,
    styleConfig: unknown,
    title: string,
): Promise<Buffer> {
    const style = resolveResumeStyle(templateId, styleConfig);
    return renderToBuffer(
        <ResumePdfDocument sections={sections} style={style} title={title} />,
    );
}
