'use client';

/**
 * Resume Studio insight rail (CareResume redesign).
 *
 * Layout, per docs/resume-studio-redesign-spec.md sections 2.7, 2.8, 2.10 and 2.15:
 *   1. Score card, ALWAYS visible: animated ATS ring, grade word, summary line.
 *   2. Tabbed card: Fixes (improvement checklist) | AI review | Tailor | Cover
 *      letter, led by a Design tab when the shell hands one in through
 *      `designSlot` (the shell owns template and style state, not this rail).
 *   3. Daily allowance card wired to the real /usage response.
 *
 * Behaviour that must not regress (all preserved verbatim from the first build):
 *   - ONE always-mounted aria-live="polite" results container. Controls live
 *     outside it so typing stays quiet, and it is never unmounted on tab change.
 *   - Quota badges, disabled-at-zero buttons, and the reset-time copy.
 *   - Only a 429 means the daily quota is gone; every other status shows the
 *     generic AI-busy line (a network failure keeps its own message).
 *   - normalizeBullet-based one-click apply with a Copy fallback, "Use as
 *     summary", and the Applied state.
 */

import { useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Gauge,
  Lightbulb,
  Loader2,
  Mail,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  studioColors,
  studioFontStack,
  studioMonoStack,
  studioRadii,
  studioShadow,
} from '@/lib/resume-studio/design';
import {
  generateCoverLetter,
  reviewDocument,
  scoreDocument,
  tailorDocument,
} from '@/components/resume-studio/studio-api';
import type {
  CoverLetterTone,
  FeatureUsage,
  ResumeDocument,
  ResumeGrade,
  ResumeReview,
  ResumeScoreResult,
  ResumeSections,
  ResumeTailoring,
  ScoreDimension,
  UsageSummary,
} from '@/components/resume-studio/studio-api';

// ─── Local theme constants ───────────────────────────────────────────────────
// The mockup values that have no token in lib/resume-studio/design.ts. They are
// named here, with the reason, rather than sprinkled as raw hex. (Spec 3.2 puts
// these in a shared studio-theme.ts; this file is the only one in scope for this
// pass, so they live here until that module exists.)
const railTheme = {
  /** Grade bands between success and warn: success is too green for "solid" and warn too dark for a ring. */
  gradeSolid: '#2f8f6a',
  gradeFair: '#c99a2e',
  /** Checklist rows. */
  warnRowBg: '#fbf1ec',
  warnRowBorder: '#efd9cd',
  infoRowBg: '#faf6ea',
  infoRowBorder: '#eee0c2',
  okRowBorder: '#cfe6d6',
  rowLabel: '#26332f',
  /** Keyword chips, deliberately lighter than the semantic tokens so a wall of them does not shout. */
  matchOkBg: '#e4f2e9',
  matchOkBorder: '#bfe0cc',
  matchOkText: '#256b42',
  matchGapBg: '#fbe6e4',
  matchGapBorder: '#edc4c0',
  matchGapText: '#9c3b34',
  /** Inactive rail tab. */
  tabInactiveBg: '#faf8f2',
  tabInactiveText: '#6b7671',
  /** Warm AI control hairline. */
  warmBorder: '#e6cfa8',
  /** Custom scrollbar thumb. */
  scrollThumb: '#d3d0c6',
} as const;

/** Display serif. IBM Plex Serif is the mockup face; Lora is the one this app ships. */
const serifStack = "'IBM Plex Serif', var(--font-lora), Georgia, serif";

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Scoped chrome CSS. Inline styles cannot express :focus-visible, custom
 * scrollbars, keyframes, or the reduced-motion opt out, so those four live here.
 * Every animation is switched off under prefers-reduced-motion, which leaves the
 * ring at its final stroke-dashoffset and the bar at its final width.
 *
 * The keyframes carry a "Rail" suffix so they cannot collide with a same-named
 * set defined by the shell: two @keyframes blocks with one name means the last
 * one in document order silently wins for everybody.
 */
const RAIL_CSS = `
@keyframes crRailIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes crRailRing { from { stroke-dashoffset: var(--cr-c) } }
@keyframes crRailBar { from { width: 0 } }
.cr-rail :focus-visible { outline: 2px solid ${studioColors.accent}; outline-offset: 2px }
.cr-panel { animation: crRailIn .2s ease }
.cr-ring-progress { transition: stroke-dashoffset .6s ease, stroke .3s; animation: crRailRing .6s ease }
.cr-bar-fill { transition: width .5s ease; animation: crRailBar .5s ease }
.cr-scroll { scrollbar-width: thin }
.cr-scroll::-webkit-scrollbar { width: 9px }
.cr-scroll::-webkit-scrollbar-thumb { background: ${railTheme.scrollThumb}; border-radius: 9px; border: 2px solid ${studioColors.canvas} }
.cr-row-btn { cursor: pointer }
.cr-row-btn:hover { box-shadow: 0 1px 4px rgba(21,38,35,.10) }
@media (prefers-reduced-motion: reduce) {
  .cr-panel, .cr-ring-progress, .cr-bar-fill { animation: none !important; transition: none !important }
}
`;

// ─── Shared style objects ────────────────────────────────────────────────────

const railCard: CSSProperties = {
  background: studioColors.surface,
  border: `1px solid ${studioColors.borderStrong}`,
  borderRadius: '14px',
  boxShadow: studioShadow.pane,
};

const cardTitle: CSSProperties = {
  fontFamily: serifStack,
  fontWeight: 600,
  fontSize: '16px',
  color: studioColors.text,
  margin: 0,
};

const eyebrow: CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '1.2px',
  fontWeight: 600,
  color: studioColors.textFaint,
};

const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: '11.5px',
  fontWeight: 600,
  color: studioColors.textBody,
  marginBottom: '5px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: studioColors.surfaceAlt,
  border: `1px solid ${studioColors.border}`,
  borderRadius: studioRadii.md,
  padding: '9px 11px',
  fontSize: '13.5px',
  lineHeight: 1.5,
  color: studioColors.text,
  fontFamily: 'inherit',
};

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'inherit',
};

const primaryBtn: CSSProperties = {
  ...btnBase,
  background: studioColors.accent,
  color: '#ffffff',
  borderRadius: studioRadii.md,
  padding: '9px 16px',
  fontSize: '13.5px',
};

const warmBtn: CSSProperties = {
  ...btnBase,
  justifyContent: 'center',
  width: '100%',
  background: studioColors.warnWash,
  color: studioColors.warn,
  border: `1px solid ${railTheme.warmBorder}`,
  borderRadius: '10px',
  padding: '11px',
  fontSize: '13px',
};

const outlineBtn: CSSProperties = {
  ...btnBase,
  background: studioColors.surface,
  color: studioColors.accent,
  border: `1px solid ${studioColors.accent}`,
  borderRadius: '8px',
  padding: '7px 14px',
  fontSize: '13px',
};

const smallOutlineBtn: CSSProperties = {
  ...outlineBtn,
  borderRadius: '7px',
  padding: '5px 11px',
  fontSize: '12px',
  whiteSpace: 'nowrap',
};

const smallSolidBtn: CSSProperties = {
  ...btnBase,
  background: studioColors.accent,
  color: '#ffffff',
  borderRadius: '7px',
  padding: '5px 11px',
  fontSize: '12px',
  whiteSpace: 'nowrap',
};

const appliedChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  borderRadius: '7px',
  padding: '5px 11px',
  fontSize: '12px',
  fontWeight: 600,
  color: studioColors.success,
  border: `1px solid ${railTheme.okRowBorder}`,
  background: studioColors.successWash,
};

function disabledStyle(disabled: boolean): CSSProperties {
  return disabled ? { opacity: 0.55, cursor: 'not-allowed' } : {};
}

// ─── Grade mapping ───────────────────────────────────────────────────────────

const GRADE_META: Record<ResumeGrade, { label: string; color: string; summary: string }> = {
  strong: { label: 'Strong', color: studioColors.success, summary: 'Ready to send.' },
  solid: { label: 'Solid', color: railTheme.gradeSolid, summary: 'Solid. A few tweaks left.' },
  'needs-work': {
    label: 'Needs work',
    color: railTheme.gradeFair,
    summary: 'Address the fixes below.',
  },
  critical: {
    label: 'Critical',
    color: studioColors.danger,
    summary: 'Several required sections are missing.',
  },
};

// ─── Preserved helpers (logic unchanged) ─────────────────────────────────────

function formatResetLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `at ${time}` : `tomorrow at ${time}`;
}

function quotaMessage(toolName: string, serverMessage: string | undefined, usage: FeatureUsage | undefined): string {
  const base = serverMessage ?? `You have used all of today's ${toolName} runs.`;
  const reset = formatResetLabel(usage?.resetAtIso);
  return reset ? `${base} Your quota resets ${reset}.` : base;
}

const AI_BUSY_MESSAGE = 'The AI service is busy right now. Please try again in a moment.';

/**
 * Only a 429 means the daily quota is exhausted. Every other error status,
 * including the gateway's 503 hourly rate limit, is a transient service problem,
 * so keep the copy generic rather than surfacing a raw server message. A network
 * failure (status 0) already carries its own friendly, specific message.
 */
function serviceErrorText(res: { status: number; message?: string }): string {
  if (res.status === 0 && res.message) return res.message;
  return AI_BUSY_MESSAGE;
}

// The AI serializes each stored bullet as "• {bullet}" and the prompts ask the
// model to echo the "verbatim bullet" as `original`, so model-returned originals
// often arrive with a leading list marker or reshuffled whitespace that the
// stored bullets do not have. Normalize both sides (strip a leading bullet or
// numeric marker, collapse internal whitespace, trim) so a one-click apply is not
// defeated by a cosmetic prefix mismatch.
function normalizeBullet(text: string): string {
  return text
    .replace(/^\s*(?:[•·‣▪]|\d+[.)]|[-*])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Improvement checklist derivation ────────────────────────────────────────

type Severity = 'warn' | 'info' | 'ok';

interface ChecklistRow {
  key: string;
  label: string;
  detail: string;
  points: number;
  severity: Severity;
  /** Editor section to jump to, when the shell supports focusing sections. */
  section?: string;
}

/**
 * Actionable label plus the editor section each scoring dimension maps to.
 * Unknown keys (if the rubric grows a dimension) fall back to the dimension's
 * own label and no jump target, so the checklist never breaks.
 */
const DIMENSION_ACTIONS: Record<string, { label: string; section: string }> = {
  'contact-basics': { label: 'Complete your contact block', section: 'contact' },
  licensure: { label: 'List your license and state', section: 'licenses' },
  certification: { label: 'Add your board certification', section: 'certifications' },
  'prescriptive-authority': { label: 'Show prescriptive authority', section: 'experience' },
  'clinical-scope': { label: 'Describe your clinical scope', section: 'experience' },
  'quantified-impact': { label: 'Quantify more bullets', section: 'experience' },
  structure: { label: 'Strengthen the resume structure', section: 'summary' },
  'recency-dates': { label: 'Date every role clearly', section: 'experience' },
};

/**
 * Every dimension returns one finding per check, whether that check passed or
 * failed, so a checklist row has to pick out the findings that actually tell the
 * user to do something. Ranking beats filtering here: a sentence that opens with
 * an imperative verb is the strongest signal, an instruction verb anywhere is a
 * weaker one, and a confirmation ("is present", "is mentioned") counts against.
 */
const IMPERATIVE_START_RE =
  /(?:^|[.!?]\s+)(add|aim|build|consider|cut|describe|expand|group|include|list|mark|mention|name|naming|rewrite|start|state|tighten|trim|use)\b/i;
const ACTION_HINT_RE =
  /\b(add|aim|consider|cut|describe|expand|group|include|list|mark|mention|naming|rewrite|say|start|state|trim|use)\b/i;
const CONFIRMATION_RE =
  /\b(?:is|are|were)\s+(?:present|mentioned|listed|described|specified|included|named)\b|\bopens with a clear\b|\bin the ideal range\b|\bwithin the last decade\b/i;

function findingRank(finding: string): number {
  let rank = 0;
  if (IMPERATIVE_START_RE.test(finding)) rank += 2;
  if (ACTION_HINT_RE.test(finding)) rank += 1;
  if (CONFIRMATION_RE.test(finding)) rank -= 2;
  return rank;
}

/** The two most actionable findings, in reading order. Falls back to the first. */
function actionableDetail(findings: string[]): string {
  const ranked = findings
    .map((finding, index) => ({ finding, index, rank: findingRank(finding) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.finding);
  return (ranked.length > 0 ? ranked : findings.slice(0, 1)).join(' ');
}

function severityFor(dimension: ScoreDimension): Severity {
  if (dimension.score >= dimension.max) return 'ok';
  return dimension.score < dimension.max / 2 ? 'warn' : 'info';
}

/**
 * One row per dimension with a deficit, biggest points win first, so the top row
 * is always the highest-value next move.
 */
function buildChecklist(dimensions: ScoreDimension[]): ChecklistRow[] {
  const rows = dimensions
    .filter((d) => d.score < d.max)
    .map((d) => {
      const action = DIMENSION_ACTIONS[d.key];
      return {
        key: d.key,
        label: action?.label ?? d.label,
        detail: actionableDetail(d.findings),
        points: Math.max(0, d.max - d.score),
        severity: severityFor(d),
        ...(action ? { section: action.section } : {}),
      } satisfies ChecklistRow;
    })
    .sort((a, b) => b.points - a.points);

  if (rows.length > 0) return rows;
  return [
    {
      key: 'looking-strong',
      label: 'Looking strong',
      detail: 'No structural gaps found. Tailor to a posting to push keyword match higher.',
      points: 0,
      severity: 'ok',
    },
  ];
}

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; color: string }> = {
  warn: { bg: railTheme.warnRowBg, border: railTheme.warnRowBorder, color: studioColors.warn },
  info: { bg: railTheme.infoRowBg, border: railTheme.infoRowBorder, color: studioColors.warn },
  ok: { bg: studioColors.successWash, border: railTheme.okRowBorder, color: studioColors.success },
};

function SeverityIcon({ severity }: { severity: Severity }) {
  const color = SEVERITY_STYLES[severity].color;
  const style: CSSProperties = { width: '16px', height: '16px', flexShrink: 0, color, marginTop: '1px' };
  if (severity === 'warn') return <AlertTriangle style={style} aria-hidden="true" />;
  if (severity === 'info') return <Lightbulb style={style} aria-hidden="true" />;
  return <CheckCircle2 style={style} aria-hidden="true" />;
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function QuotaBadge({ usage }: { usage: FeatureUsage | undefined }) {
  if (!usage) return null;
  const reset = formatResetLabel(usage.resetAtIso);
  const isOut = usage.remaining <= 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '6px',
        padding: '3px 9px',
        fontFamily: studioMonoStack,
        fontSize: '11.5px',
        fontWeight: 600,
        background: isOut ? railTheme.warnRowBg : studioColors.accentWash,
        color: isOut ? studioColors.danger : studioColors.accentDark,
      }}
    >
      {isOut
        ? `0 of ${usage.cap} left today${reset ? `, resets ${reset}` : ''}`
        : `${usage.remaining} of ${usage.cap} left today`}
    </span>
  );
}

function FriendlyNotice({ text, tone }: { text: string; tone: 'quota' | 'error' }) {
  const quota = tone === 'quota';
  return (
    <p
      style={{
        borderRadius: '10px',
        padding: '11px 12px',
        fontSize: '12.5px',
        lineHeight: 1.5,
        fontWeight: 500,
        margin: 0,
        background: quota ? studioColors.warnWash : railTheme.warnRowBg,
        border: `1px solid ${quota ? railTheme.warmBorder : railTheme.warnRowBorder}`,
        color: quota ? studioColors.warn : studioColors.danger,
      }}
    >
      {text}
    </p>
  );
}

function QuotaOutNote({ toolName, usage }: { toolName: string; usage: FeatureUsage | undefined }) {
  if (usage?.remaining !== 0) return null;
  return (
    <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: studioColors.warn }}>
      You are out of {toolName} for today. Your quota resets {formatResetLabel(usage.resetAtIso) ?? 'tomorrow'}.
    </p>
  );
}

function SubHeading({ children }: { children: string }) {
  return (
    <h4
      style={{
        ...eyebrow,
        margin: '0 0 6px',
      }}
    >
      {children}
    </h4>
  );
}

function PendingLine({ children }: { children: string }) {
  return (
    <p
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        margin: 0,
        fontSize: '13px',
        color: studioColors.textMuted,
      }}
    >
      <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" aria-hidden="true" />
      {children}
    </p>
  );
}

interface BeforeAfterCardProps {
  original: string;
  improved: string;
  rationale: string;
  applied: boolean;
  canApply: boolean;
  onApply: () => void;
  onCopy: () => void;
}

function BeforeAfterCard({ original, improved, rationale, applied, canApply, onApply, onCopy }: BeforeAfterCardProps) {
  return (
    <div
      style={{
        border: `1px solid ${studioColors.borderSoft}`,
        borderRadius: '10px',
        padding: '11px',
        background: studioColors.surface,
      }}
    >
      <p style={{ ...eyebrow, margin: 0, fontSize: '10px', letterSpacing: '.9px' }}>Before</p>
      <p style={{ margin: '3px 0 0', fontSize: '12.5px', lineHeight: 1.45, color: studioColors.textMuted }}>
        {original}
      </p>
      <p style={{ ...eyebrow, margin: '9px 0 0', fontSize: '10px', letterSpacing: '.9px', color: studioColors.accent }}>
        After
      </p>
      <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 500, color: studioColors.textStrong }}>
        {improved}
      </p>
      {rationale && (
        <p style={{ margin: '6px 0 0', fontSize: '11.5px', fontStyle: 'italic', color: studioColors.textFaint }}>
          {rationale}
        </p>
      )}
      <div style={{ marginTop: '9px' }}>
        {applied ? (
          <span style={appliedChip}>
            <Check style={{ width: '13px', height: '13px' }} aria-hidden="true" /> Applied
          </span>
        ) : canApply ? (
          <button type="button" onClick={onApply} style={smallSolidBtn}>
            Use this
          </button>
        ) : (
          <button type="button" onClick={onCopy} style={smallOutlineBtn}>
            <Copy style={{ width: '13px', height: '13px' }} aria-hidden="true" /> Copy
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ATS ring ────────────────────────────────────────────────────────────────

interface AtsRingProps {
  total: number | null;
  outOf: number;
  grade: ResumeGrade | null;
}

function AtsRing({ total, outOf, grade }: AtsRingProps) {
  const meta = grade ? GRADE_META[grade] : null;
  const ratio = total !== null && outOf > 0 ? Math.min(1, Math.max(0, total / outOf)) : 0;
  const offset = RING_CIRCUMFERENCE * (1 - ratio);
  const color = meta ? meta.color : studioColors.textFaint;
  return (
    <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto' }}>
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true" focusable="false">
        <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke={studioColors.wellAlt} strokeWidth="11" />
        <circle
          className="cr-ring-progress"
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          style={{ '--cr-c': `${RING_CIRCUMFERENCE}` } as CSSProperties}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {total === null || !meta ? (
          <>
            <Gauge style={{ width: '24px', height: '24px', color: studioColors.textFaint }} aria-hidden="true" />
            <span style={{ marginTop: '5px', fontSize: '11px', fontWeight: 600, color: studioColors.textFaint }}>
              Not checked
            </span>
          </>
        ) : (
          <>
            <span style={{ fontFamily: studioMonoStack, fontWeight: 600, fontSize: '34px', color, lineHeight: 1 }}>
              {total}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: studioColors.textFaint }}>{meta.label}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Keyword match (Tailor tab) ──────────────────────────────────────────────

function matchBandColor(pct: number): string {
  if (pct >= 80) return studioColors.success;
  if (pct >= 55) return railTheme.gradeFair;
  return studioColors.danger;
}

function KeywordChip({ label, matched }: { label: string; matched: boolean }) {
  const tone = matched
    ? { bg: railTheme.matchOkBg, border: railTheme.matchOkBorder, color: railTheme.matchOkText }
    : { bg: railTheme.matchGapBg, border: railTheme.matchGapBorder, color: railTheme.matchGapText };
  const Icon = matched ? Check : X;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.color,
        borderRadius: '7px',
        padding: '4px 10px',
        fontSize: '12.5px',
        fontWeight: 500,
        maxWidth: '100%',
        overflowWrap: 'anywhere',
      }}
    >
      <Icon style={{ width: '12px', height: '12px' }} aria-hidden="true" />
      {label}
    </span>
  );
}

// ─── Main rail ───────────────────────────────────────────────────────────────

/**
 * Four tabs, not the mockup's three, plus Design when the shell supplies it.
 * The mockup's Tools tab is a launcher for tailor and cover letter, both of
 * which already exist here as first class tabs with quota badges, and its Score
 * tab is unnecessary because the ring above the tab set is always visible.
 */
type RailTab = 'design' | 'score' | 'review' | 'tailor' | 'cover';

const TOOL_TABS: readonly RailTab[] = ['score', 'review', 'tailor', 'cover'];

const TAB_LABELS: Record<RailTab, string> = {
  design: 'Design',
  score: 'Fixes',
  review: 'AI review',
  tailor: 'Tailor',
  cover: 'Cover letter',
};

interface InsightRailProps {
  doc: ResumeDocument;
  usage: UsageSummary | null;
  onFeatureUsage: (key: keyof UsageSummary, usage: FeatureUsage) => void;
  onSectionsChange: (sections: ResumeSections, docId: string) => void;
  /**
   * Optional: called after a successful score so the shell can badge the
   * document. The document id rides along so a late response cannot be filed
   * against a document the user has since switched away from.
   */
  onScore?: (score: ResumeScoreResult, docId: string) => void;
  /** Optional: jump the editor to a section from a checklist row. */
  onFocusSection?: (section: string) => void;
  /**
   * Optional: template, font, density and paper controls. The shell owns that
   * state, so it hands the controls in and this rail only gives them a tab.
   */
  designSlot?: ReactNode;
}

export default function InsightRail({
  doc,
  usage,
  onFeatureUsage,
  onSectionsChange,
  onScore,
  onFocusSection,
  designSlot,
}: InsightRailProps) {
  const { toast } = useToast();
  const baseId = useId();
  const [selectedTab, setSelectedTab] = useState<RailTab>('score');
  const tabRefs = useRef<Partial<Record<RailTab, HTMLButtonElement | null>>>({});

  // Design only exists while the shell supplies its controls, so a selection of
  // "design" falls back to the checklist rather than rendering an empty panel.
  const tabs: RailTab[] = designSlot ? ['design', ...TOOL_TABS] : [...TOOL_TABS];
  const activeTab: RailTab = tabs.includes(selectedTab) ? selectedTab : 'score';
  const setActiveTab = setSelectedTab;

  // Score
  const [score, setScore] = useState<ResumeScoreResult | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // AI review
  const [review, setReview] = useState<ResumeReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<{ text: string; tone: 'quota' | 'error' } | null>(null);
  const [appliedReview, setAppliedReview] = useState<number[]>([]);

  // Tailor
  const [tailorJobText, setTailorJobText] = useState('');
  const [tailoring, setTailoring] = useState<ResumeTailoring | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);
  const [tailorNotice, setTailorNotice] = useState<{ text: string; tone: 'quota' | 'error' } | null>(null);
  const [appliedTailor, setAppliedTailor] = useState<number[]>([]);
  const [summaryApplied, setSummaryApplied] = useState(false);

  // Cover letter
  const [coverJobText, setCoverJobText] = useState('');
  const [coverTone, setCoverTone] = useState<CoverLetterTone>('professional');
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverNotice, setCoverNotice] = useState<{ text: string; tone: 'quota' | 'error' } | null>(null);
  const [coverCopied, setCoverCopied] = useState(false);

  // ── Shared helpers ─────────────────────────────────────────────────────────

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard', 'success');
      return true;
    } catch {
      toast('Could not copy. Select the text and copy it manually.', 'error');
      return false;
    }
  };

  const bulletExistsInDoc = (original: string): boolean => {
    const target = normalizeBullet(original);
    return doc.sections.experience.some((exp) => exp.bullets.some((b) => normalizeBullet(b) === target));
  };

  /** Replace the first normalized-match bullet in experience; returns whether a swap happened. */
  const applyBulletReplacement = (original: string, replacement: string): boolean => {
    const sections = doc.sections;
    const target = normalizeBullet(original);
    let replaced = false;
    const experience = sections.experience.map((exp) => {
      if (replaced) return exp;
      const idx = exp.bullets.findIndex((b) => normalizeBullet(b) === target);
      if (idx === -1) return exp;
      replaced = true;
      return { ...exp, bullets: exp.bullets.map((b, i) => (i === idx ? replacement : b)) };
    });
    if (replaced) {
      onSectionsChange({ ...sections, experience }, doc.id);
      toast('Bullet updated in your resume', 'success');
    }
    return replaced;
  };

  // ── Run handlers ───────────────────────────────────────────────────────────

  const runScore = async () => {
    setScoreLoading(true);
    setScoreError(null);
    const res = await scoreDocument(doc.id);
    if (res.ok) {
      setScore(res.data.score);
      onScore?.(res.data.score, doc.id);
    } else {
      setScoreError(res.message ?? 'Something went wrong while scoring. Please try again.');
    }
    setScoreLoading(false);
  };

  const runReview = async () => {
    setReviewLoading(true);
    setReviewNotice(null);
    const res = await reviewDocument(doc.id);
    if (res.ok) {
      setReview(res.data.review);
      setAppliedReview([]);
      if (res.data.usage) onFeatureUsage('resume_review', res.data.usage);
    } else if (res.status === 429) {
      if (res.usage) onFeatureUsage('resume_review', res.usage);
      setReviewNotice({ text: quotaMessage('AI review', res.message, res.usage ?? usage?.resume_review), tone: 'quota' });
    } else {
      setReviewNotice({ text: serviceErrorText(res), tone: 'error' });
    }
    setReviewLoading(false);
  };

  const runTailor = async () => {
    const jobText = tailorJobText.trim();
    if (!jobText) return;
    setTailorLoading(true);
    setTailorNotice(null);
    const res = await tailorDocument({ documentId: doc.id, jobText });
    if (res.ok) {
      setTailoring(res.data.tailoring);
      setAppliedTailor([]);
      setSummaryApplied(false);
      if (res.data.usage) onFeatureUsage('resume_tailoring', res.data.usage);
    } else if (res.status === 429) {
      if (res.usage) onFeatureUsage('resume_tailoring', res.usage);
      setTailorNotice({ text: quotaMessage('tailoring', res.message, res.usage ?? usage?.resume_tailoring), tone: 'quota' });
    } else {
      setTailorNotice({ text: serviceErrorText(res), tone: 'error' });
    }
    setTailorLoading(false);
  };

  const runCoverLetter = async () => {
    setCoverLoading(true);
    setCoverNotice(null);
    const jobText = coverJobText.trim();
    const res = await generateCoverLetter({
      documentId: doc.id,
      ...(jobText ? { jobText } : {}),
      tone: coverTone,
    });
    if (res.ok) {
      setCoverLetter(res.data.coverLetter);
      setCoverCopied(false);
      if (res.data.usage) onFeatureUsage('cover_letter', res.data.usage);
    } else if (res.status === 429) {
      if (res.usage) onFeatureUsage('cover_letter', res.usage);
      setCoverNotice({ text: quotaMessage('cover letter', res.message, res.usage ?? usage?.cover_letter), tone: 'quota' });
    } else {
      setCoverNotice({ text: serviceErrorText(res), tone: 'error' });
    }
    setCoverLoading(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const reviewUsage = usage?.resume_review;
  const tailorUsage = usage?.resume_tailoring;
  const coverUsage = usage?.cover_letter;

  const scoreTotalMax = useMemo(
    () => (score ? score.dimensions.reduce((sum, d) => sum + d.max, 0) : 100),
    [score],
  );
  const checklist = useMemo(() => (score ? buildChecklist(score.dimensions) : []), [score]);
  const gradeMeta = score ? GRADE_META[score.grade] : null;

  const keywordStats = useMemo(() => {
    const alignment = tailoring?.keywordAlignment ?? [];
    const matched = alignment.filter((k) => k.presentInResume);
    const missing = alignment.filter((k) => !k.presentInResume);
    const pct = alignment.length > 0 ? Math.round((matched.length / alignment.length) * 100) : 0;
    return { matched, missing, pct, total: alignment.length };
  }, [tailoring]);

  const allowanceRows: { id: RailTab; label: string; usage: FeatureUsage | undefined }[] = [
    { id: 'score', label: 'Resume score', usage: undefined },
    { id: 'review', label: 'AI review', usage: reviewUsage },
    { id: 'tailor', label: 'Tailor to posting', usage: tailorUsage },
    { id: 'cover', label: 'Cover letter', usage: coverUsage },
  ];
  const resetLabel = formatResetLabel(
    reviewUsage?.resetAtIso ?? tailorUsage?.resetAtIso ?? coverUsage?.resetAtIso,
  );

  const tabId = (t: RailTab) => `${baseId}-tab-${t}`;
  const panelId = (t: RailTab) => `${baseId}-panel-${t}`;

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const count = tabs.length;
    const index = tabs.indexOf(activeTab);
    let next: RailTab | null = null;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % count];
    else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + count) % count];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[count - 1];
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  const jumpToSection = (section: string | undefined) => {
    if (!section || !onFocusSection) return;
    onFocusSection(section);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="cr-rail"
      style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontFamily: studioFontStack, minWidth: 0 }}
    >
      <style>{RAIL_CSS}</style>

      {/* ── Score card: always visible, never inside the tab set ── */}
      <div style={{ ...railCard, padding: '18px', textAlign: 'center' }}>
        <div style={{ ...eyebrow, marginBottom: '12px' }}>Resume score</div>
        <div
          {...(score && gradeMeta
            ? {
                role: 'img',
                'aria-label': `Resume score ${score.total} out of ${scoreTotalMax}, grade ${gradeMeta.label}`,
              }
            : {})}
        >
          <AtsRing total={score ? score.total : null} outOf={scoreTotalMax} grade={score ? score.grade : null} />
        </div>
        <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: studioColors.textMuted }}>
          {gradeMeta ? gradeMeta.summary : 'Run the free check to see how this resume scores.'}
        </p>
        {score && (
          <p
            style={{
              margin: '4px 0 0',
              fontFamily: studioMonoStack,
              fontSize: '11px',
              color: studioColors.textFaint,
            }}
          >
            {score.total} out of {scoreTotalMax} points
          </p>
        )}
        <div
          style={{
            marginTop: '13px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => void runScore()}
            disabled={scoreLoading}
            style={{ ...primaryBtn, ...disabledStyle(scoreLoading) }}
          >
            {scoreLoading ? (
              <Loader2 style={{ width: '15px', height: '15px' }} className="animate-spin" aria-hidden="true" />
            ) : (
              <Gauge style={{ width: '15px', height: '15px' }} aria-hidden="true" />
            )}
            {score ? 'Check again' : 'Check score'}
          </button>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '6px',
              padding: '3px 9px',
              fontFamily: studioMonoStack,
              fontSize: '11.5px',
              fontWeight: 600,
              background: studioColors.accentWash,
              color: studioColors.accentDark,
            }}
          >
            Free and unlimited
          </span>
        </div>
      </div>

      {/* ── Tabbed card ── */}
      <div style={{ ...railCard, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          role="tablist"
          aria-label="Insight tools"
          style={{ display: 'flex', flexWrap: 'wrap', borderBottom: `1px solid ${studioColors.wellAlt}` }}
        >
          {tabs.map((id) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={tabId(id)}
                aria-selected={isActive}
                // Only the selected panel is in the DOM, so only the selected
                // tab may claim aria-controls: pointing at a missing id is a
                // worse failure than omitting the attribute.
                {...(isActive ? { 'aria-controls': panelId(id) } : {})}
                tabIndex={isActive ? 0 : -1}
                ref={(node) => {
                  tabRefs.current[id] = node;
                }}
                onClick={() => setActiveTab(id)}
                onKeyDown={onTabKeyDown}
                style={{
                  flex: '1 1 auto',
                  minWidth: '62px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: '11px 6px',
                  fontSize: '12.5px',
                  background: isActive ? studioColors.surface : railTheme.tabInactiveBg,
                  color: isActive ? studioColors.accentDark : railTheme.tabInactiveText,
                  fontWeight: isActive ? 600 : 500,
                  borderBottom: `2px solid ${isActive ? studioColors.accent : 'transparent'}`,
                }}
              >
                {TAB_LABELS[id]}
              </button>
            );
          })}
        </div>

        {/* Per-tab controls. Kept OUTSIDE the live region so typing stays quiet. */}
        <div
          className="cr-panel"
          role="tabpanel"
          id={panelId(activeTab)}
          aria-labelledby={tabId(activeTab)}
          tabIndex={0}
          style={{ padding: '14px' }}
        >
          {activeTab === 'design' && designSlot}

          {activeTab === 'score' && (
            <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5, color: studioColors.textMuted }}>
              These fixes come from the same deterministic rubric an applicant tracking system rewards. They are free,
              unlimited, and ordered by how many points each one is worth.
            </p>
          )}

          {activeTab === 'review' && (
            <div>
              <p style={{ margin: '0 0 10px', fontSize: '12.5px', lineHeight: 1.5, color: studioColors.textMuted }}>
                A deep AI read of your resume: strengths, gaps, and rewritten bullets you can apply in one click. The
                checklist above stays free, so spend a review when you want a human style critique.
              </p>
              <button
                type="button"
                onClick={() => void runReview()}
                disabled={reviewLoading || reviewUsage?.remaining === 0}
                style={{ ...warmBtn, ...disabledStyle(reviewLoading || reviewUsage?.remaining === 0) }}
              >
                {reviewLoading ? (
                  <Loader2 style={{ width: '15px', height: '15px' }} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles style={{ width: '15px', height: '15px' }} aria-hidden="true" />
                )}
                {review ? 'Run the deep review again' : 'Deep AI review'}
              </button>
              <div style={{ marginTop: '9px' }}>
                <QuotaBadge usage={reviewUsage} />
              </div>
              <QuotaOutNote toolName="AI reviews" usage={reviewUsage} />
            </div>
          )}

          {activeTab === 'tailor' && (
            <div>
              <label style={{ display: 'block' }}>
                <span style={fieldLabel}>Paste the job posting</span>
                <textarea
                  value={tailorJobText}
                  onChange={(e) => setTailorJobText(e.target.value)}
                  rows={6}
                  placeholder="Paste the full job description here and we will map your resume against it."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '9px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => void runTailor()}
                  disabled={tailorLoading || tailorJobText.trim() === '' || tailorUsage?.remaining === 0}
                  style={{
                    ...primaryBtn,
                    ...disabledStyle(tailorLoading || tailorJobText.trim() === '' || tailorUsage?.remaining === 0),
                  }}
                >
                  {tailorLoading ? (
                    <Loader2 style={{ width: '15px', height: '15px' }} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Target style={{ width: '15px', height: '15px' }} aria-hidden="true" />
                  )}
                  Analyze match
                </button>
                <QuotaBadge usage={tailorUsage} />
              </div>
              <QuotaOutNote toolName="tailoring runs" usage={tailorUsage} />
            </div>
          )}

          {activeTab === 'cover' && (
            <div>
              <label style={{ display: 'block' }}>
                <span style={fieldLabel}>Paste the job posting</span>
                <textarea
                  value={coverJobText}
                  onChange={(e) => setCoverJobText(e.target.value)}
                  rows={5}
                  placeholder="Paste a posting for a targeted letter, or leave this blank for a general one."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
              <label style={{ display: 'block', marginTop: '10px' }}>
                <span style={fieldLabel}>Tone</span>
                <select
                  value={coverTone}
                  onChange={(e) => setCoverTone(e.target.value as CoverLetterTone)}
                  style={{ ...inputStyle, background: studioColors.surface }}
                >
                  <option value="professional">Professional</option>
                  <option value="warm">Warm</option>
                  <option value="direct">Direct</option>
                </select>
              </label>
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '9px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => void runCoverLetter()}
                  disabled={coverLoading || coverUsage?.remaining === 0}
                  style={{ ...primaryBtn, ...disabledStyle(coverLoading || coverUsage?.remaining === 0) }}
                >
                  {coverLoading ? (
                    <Loader2 style={{ width: '15px', height: '15px' }} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Mail style={{ width: '15px', height: '15px' }} aria-hidden="true" />
                  )}
                  Write cover letter
                </button>
                <QuotaBadge usage={coverUsage} />
              </div>
              <QuotaOutNote toolName="cover letters" usage={coverUsage} />
            </div>
          )}
        </div>

        {/* Results live region: ALWAYS mounted so the first result is announced too. */}
        <div
          aria-live="polite"
          className="cr-scroll"
          style={{
            borderTop: `1px solid ${studioColors.wellAlt}`,
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: '460px',
            overflowY: 'auto',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {/* ── Score status: announced from any tab, because the check button is always visible ── */}
          {scoreLoading && <PendingLine>Scoring your resume...</PendingLine>}
          {scoreError && <FriendlyNotice text={scoreError} tone="error" />}
          {score && !scoreLoading && (
            <p style={{ margin: 0, fontSize: '12.5px', color: studioColors.textMuted }}>
              Resume score {score.total} out of {scoreTotalMax}. {gradeMeta?.label}.
            </p>
          )}

          {/* ── Improvement checklist ── */}
          {activeTab === 'score' && !score && !scoreLoading && !scoreError && (
            <div
              style={{
                background: studioColors.well,
                borderRadius: '10px',
                padding: '16px',
                fontSize: '13px',
                lineHeight: 1.55,
                color: studioColors.textMuted,
              }}
            >
              Run the free check above and every gap in this resume shows up here as an ordered work list, with the
              points each fix is worth.
            </div>
          )}
          {activeTab === 'score' && score && !scoreLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {checklist.map((row) => {
                const tone = SEVERITY_STYLES[row.severity];
                const clickable = Boolean(row.section && onFocusSection);
                const body = (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', textAlign: 'left' }}>
                    <SeverityIcon severity={row.severity} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: railTheme.rowLabel }}>{row.label}</div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: studioColors.textSoft,
                          marginTop: '2px',
                          lineHeight: 1.4,
                        }}
                      >
                        {row.detail}
                      </div>
                    </div>
                    {row.points > 0 && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontFamily: studioMonoStack,
                          fontSize: '11px',
                          fontWeight: 600,
                          color: tone.color,
                        }}
                      >
                        +{row.points} pts
                      </span>
                    )}
                  </div>
                );
                const shell: CSSProperties = {
                  border: `1px solid ${tone.border}`,
                  background: tone.bg,
                  borderRadius: '10px',
                  padding: '11px 12px',
                  width: '100%',
                  fontFamily: 'inherit',
                };
                return clickable ? (
                  <button
                    key={row.key}
                    type="button"
                    className="cr-row-btn"
                    onClick={() => jumpToSection(row.section)}
                    style={shell}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={row.key} style={shell}>
                    {body}
                  </div>
                );
              })}

              <details style={{ marginTop: '2px' }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: studioColors.accentDark,
                    padding: '4px 0',
                  }}
                >
                  Full score breakdown
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginTop: '10px' }}>
                  {score.dimensions.map((dim) => {
                    const pct = dim.max > 0 ? Math.min(100, Math.max(0, (dim.score / dim.max) * 100)) : 0;
                    return (
                      <div key={dim.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: studioColors.textStrong }}>
                            {dim.label}
                          </span>
                          <span
                            style={{
                              flexShrink: 0,
                              fontFamily: studioMonoStack,
                              fontSize: '11px',
                              color: studioColors.textFaint,
                            }}
                          >
                            {dim.score} of {dim.max}
                          </span>
                        </div>
                        <div
                          style={{
                            marginTop: '5px',
                            height: '6px',
                            background: studioColors.wellAlt,
                            borderRadius: '9px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            className="cr-bar-fill"
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: studioColors.accent,
                              borderRadius: '9px',
                            }}
                          />
                        </div>
                        {dim.findings.length > 0 && (
                          <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
                            {dim.findings.map((finding, fi) => (
                              <li
                                key={fi}
                                style={{ fontSize: '11.5px', lineHeight: 1.45, color: studioColors.textSoft }}
                              >
                                {finding}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}

          {/* ── AI review results ── */}
          {activeTab === 'review' && reviewLoading && (
            <PendingLine>Reviewing your resume. This can take a moment...</PendingLine>
          )}
          {activeTab === 'review' && reviewNotice && <FriendlyNotice text={reviewNotice.text} tone={reviewNotice.tone} />}
          {activeTab === 'review' && review && !reviewLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <SubHeading>Overall</SubHeading>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: studioColors.textStrong }}>
                  {review.overallAssessment}
                </p>
              </div>

              {review.strengths.length > 0 && (
                <div>
                  <SubHeading>Strengths</SubHeading>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {review.strengths.map((strength, i) => (
                      <li
                        key={i}
                        style={{ display: 'flex', gap: '7px', fontSize: '13px', lineHeight: 1.45, color: studioColors.textStrong }}
                      >
                        <CheckCircle2
                          style={{ width: '15px', height: '15px', flexShrink: 0, marginTop: '2px', color: studioColors.success }}
                          aria-hidden="true"
                        />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {review.gaps.length > 0 && (
                <div>
                  <SubHeading>Gaps</SubHeading>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {review.gaps.map((gap, i) => (
                      <div
                        key={i}
                        style={{
                          border: `1px solid ${studioColors.borderSoft}`,
                          borderRadius: '10px',
                          padding: '11px',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: railTheme.rowLabel }}>
                          {gap.area}
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: '12px', lineHeight: 1.45, color: studioColors.textSoft }}>
                          {gap.why}
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: '12px', fontWeight: 600, color: studioColors.accent }}>
                          Fix: {gap.fix}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {review.rewrittenBullets.length > 0 && (
                <div>
                  <SubHeading>Rewritten bullets</SubHeading>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {review.rewrittenBullets.map((rb, i) => (
                      <BeforeAfterCard
                        key={i}
                        original={rb.original}
                        improved={rb.improved}
                        rationale={rb.rationale}
                        applied={appliedReview.includes(i)}
                        canApply={bulletExistsInDoc(rb.original)}
                        onApply={() => {
                          if (applyBulletReplacement(rb.original, rb.improved)) {
                            setAppliedReview((prev) => [...prev, i]);
                          }
                        }}
                        onCopy={() => void copyToClipboard(rb.improved)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {review.sectionNotes.length > 0 && (
                <div>
                  <SubHeading>Section notes</SubHeading>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {review.sectionNotes.map((note, i) => (
                      <li key={i} style={{ fontSize: '13px', lineHeight: 1.45, color: studioColors.textStrong }}>
                        <span style={{ fontWeight: 600 }}>{note.section}:</span> {note.note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {review.atsTips.length > 0 && (
                <div>
                  <SubHeading>ATS tips</SubHeading>
                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {review.atsTips.map((tip, i) => (
                      <li key={i} style={{ fontSize: '13px', lineHeight: 1.45, color: studioColors.textStrong }}>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Tailor results ── */}
          {activeTab === 'tailor' && tailorLoading && (
            <PendingLine>Mapping your resume against the posting...</PendingLine>
          )}
          {activeTab === 'tailor' && tailorNotice && <FriendlyNotice text={tailorNotice.text} tone={tailorNotice.tone} />}
          {activeTab === 'tailor' && tailoring && !tailorLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {keywordStats.total > 0 && (
                <div
                  style={{
                    border: `1px solid ${studioColors.borderSoft}`,
                    borderRadius: '12px',
                    padding: '14px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ ...eyebrow, marginBottom: '8px' }}>Keyword match</div>
                  <div
                    style={{
                      fontFamily: studioMonoStack,
                      fontWeight: 600,
                      fontSize: '42px',
                      lineHeight: 1,
                      color: matchBandColor(keywordStats.pct),
                    }}
                  >
                    {keywordStats.pct}%
                  </div>
                  <div
                    style={{
                      height: '9px',
                      background: studioColors.wellAlt,
                      borderRadius: '9px',
                      marginTop: '12px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      className="cr-bar-fill"
                      style={{
                        height: '100%',
                        width: `${keywordStats.pct}%`,
                        background: matchBandColor(keywordStats.pct),
                        borderRadius: '9px',
                      }}
                    />
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: studioColors.textFaint }}>
                    {keywordStats.matched.length} of {keywordStats.total} posting keywords already appear in this resume.
                  </p>
                </div>
              )}

              <div>
                <SubHeading>Fit summary</SubHeading>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: studioColors.textStrong }}>
                  {tailoring.fitSummary}
                </p>
              </div>

              {keywordStats.total > 0 && (
                <div>
                  <SubHeading>Coverage</SubHeading>
                  {keywordStats.matched.length > 0 && (
                    <>
                      <p style={{ margin: '0 0 6px', fontSize: '12px', color: studioColors.textFaint }}>Matched</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '12px' }}>
                        {keywordStats.matched.map((kw, i) => (
                          <KeywordChip key={`m-${i}`} label={kw.keyword} matched />
                        ))}
                      </div>
                    </>
                  )}
                  {keywordStats.missing.length > 0 && (
                    <>
                      <p style={{ margin: '0 0 6px', fontSize: '12px', color: studioColors.textFaint }}>
                        Missing, add these
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                        {keywordStats.missing.map((kw, i) => (
                          <KeywordChip key={`g-${i}`} label={kw.keyword} matched={false} />
                        ))}
                      </div>
                      <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {keywordStats.missing
                          .filter((kw) => kw.suggestion)
                          .map((kw, i) => (
                            <li key={`s-${i}`} style={{ fontSize: '12px', lineHeight: 1.45, color: studioColors.textSoft }}>
                              <span style={{ fontWeight: 600, color: studioColors.textStrong }}>{kw.keyword}:</span>{' '}
                              {kw.suggestion}
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {tailoring.tailoredSummary && (
                <div
                  style={{
                    border: `1px solid ${studioColors.borderSoft}`,
                    borderRadius: '10px',
                    padding: '11px',
                  }}
                >
                  <SubHeading>Tailored summary</SubHeading>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: studioColors.textStrong }}>
                    {tailoring.tailoredSummary}
                  </p>
                  <div style={{ marginTop: '9px' }}>
                    {summaryApplied ? (
                      <span style={appliedChip}>
                        <Check style={{ width: '13px', height: '13px' }} aria-hidden="true" /> Applied
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSectionsChange({ ...doc.sections, summary: tailoring.tailoredSummary }, doc.id);
                          setSummaryApplied(true);
                          toast('Summary updated in your resume', 'success');
                        }}
                        style={smallSolidBtn}
                      >
                        Use as summary
                      </button>
                    )}
                  </div>
                </div>
              )}

              {tailoring.tailoredBullets.length > 0 && (
                <div>
                  <SubHeading>Suggested bullets</SubHeading>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {tailoring.tailoredBullets.map((tb, i) => (
                      <BeforeAfterCard
                        key={i}
                        original={tb.original}
                        improved={tb.tailored}
                        rationale={tb.rationale}
                        applied={appliedTailor.includes(i)}
                        canApply={bulletExistsInDoc(tb.original)}
                        onApply={() => {
                          if (applyBulletReplacement(tb.original, tb.tailored)) {
                            setAppliedTailor((prev) => [...prev, i]);
                          }
                        }}
                        onCopy={() => void copyToClipboard(tb.tailored)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {tailoring.gapsToAddress.length > 0 && (
                <div>
                  <SubHeading>Gaps to address</SubHeading>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {tailoring.gapsToAddress.map((gap, i) => (
                      <div
                        key={i}
                        style={{
                          border: `1px solid ${studioColors.borderSoft}`,
                          borderRadius: '10px',
                          padding: '11px',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: railTheme.rowLabel }}>
                          {gap.gap}
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: '12px', lineHeight: 1.45, color: studioColors.textSoft }}>
                          {gap.mitigation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Cover letter result ── */}
          {activeTab === 'cover' && coverLoading && <PendingLine>Writing your cover letter...</PendingLine>}
          {activeTab === 'cover' && coverNotice && <FriendlyNotice text={coverNotice.text} tone={coverNotice.tone} />}
          {activeTab === 'cover' && coverLetter !== null && !coverLoading && (
            <div>
              <label style={{ display: 'block' }}>
                <span className="sr-only">Generated cover letter</span>
                <textarea
                  readOnly
                  value={coverLetter}
                  rows={14}
                  style={{
                    ...inputStyle,
                    fontFamily: serifStack,
                    fontSize: '13px',
                    lineHeight: 1.6,
                    background: studioColors.surface,
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(coverLetter).then((didCopy) => {
                    if (didCopy) setCoverCopied(true);
                  });
                }}
                style={{ ...smallOutlineBtn, marginTop: '9px' }}
              >
                {coverCopied ? (
                  <>
                    <Check style={{ width: '13px', height: '13px' }} aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>
                    <Copy style={{ width: '13px', height: '13px' }} aria-hidden="true" /> Copy letter
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Daily allowance ── */}
      <div style={{ ...railCard, padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
          <h3 style={cardTitle}>Today&apos;s AI allowance</h3>
          {resetLabel && (
            <span style={{ fontSize: '11.5px', color: studioColors.textFaint }}>resets {resetLabel}</span>
          )}
        </div>
        <p style={{ margin: '6px 0 4px', fontSize: '12px', lineHeight: 1.45, color: studioColors.textFaint }}>
          The score is always free. AI tools spend a credit only when they succeed.
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {allowanceRows.map(({ id, label, usage: rowUsage }) => {
            const out = rowUsage ? rowUsage.remaining <= 0 : false;
            return (
              <li
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '7px 0',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(id)}
                  style={{
                    ...btnBase,
                    background: 'none',
                    padding: 0,
                    fontSize: '13.5px',
                    fontWeight: activeTab === id ? 600 : 500,
                    color: activeTab === id ? studioColors.accentDark : studioColors.textBody,
                    textAlign: 'left',
                    minWidth: 0,
                  }}
                >
                  {label}
                </button>
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: studioMonoStack,
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    padding: '3px 9px',
                    background: !rowUsage
                      ? studioColors.accentWash
                      : out
                        ? railTheme.warnRowBg
                        : studioColors.warnWash,
                    color: !rowUsage
                      ? studioColors.accentDark
                      : out
                        ? studioColors.danger
                        : studioColors.warn,
                  }}
                >
                  {!rowUsage ? 'Unlimited' : `${rowUsage.remaining} of ${rowUsage.cap}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
