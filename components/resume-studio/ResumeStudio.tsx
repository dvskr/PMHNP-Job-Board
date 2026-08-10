'use client';

/**
 * Resume Studio shell (CareResume redesign).
 *
 * Owns document CRUD, the selected document, the presentation style controls,
 * and the three pane layout: design rail (templates, fonts, sizing) |
 * editor (SectionEditor, with an in-place Preview toggle that swaps in
 * ResumePreview) | AI rail (InsightRail: score, review, tailoring).
 *
 * Every color, radius, and shadow comes from lib/resume-studio/design.ts, and
 * every paper measurement comes from lib/resume-studio/templates.ts through
 * resolveResumeStyle(), which is the same registry the PDF export reads. The
 * preview cannot drift from the export because neither one owns a number.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import SectionEditor from '@/components/resume-studio/SectionEditor';
import type { SaveState } from '@/components/resume-studio/SectionEditor';
import InsightRail from '@/components/resume-studio/InsightRail';
import ResumePreview from '@/components/resume-studio/ResumePreview';
import {
  studioColors,
  studioFontStack,
  studioMonoStack,
  studioShadow,
} from '@/lib/resume-studio/design';
import {
  RESUME_DENSITIES,
  RESUME_FONTS,
  RESUME_PAPERS,
  RESUME_TEMPLATES,
  resolveResumeStyle,
} from '@/lib/resume-studio/templates';
import type { ResumeStyleConfig, ResumeTemplateId } from '@/lib/resume-studio/templates';
import {
  createDocument,
  deleteDocument,
  documentPdfUrl,
  duplicateDocument,
  getDocument,
  getUsage,
  listDocuments,
  updateDocument,
} from '@/components/resume-studio/studio-api';
import type {
  FeatureUsage,
  ResumeDocument,
  ResumeDocumentSummary,
  ResumeGrade,
  ResumeScoreResult,
  ResumeSections,
  ResumeTemplate,
  UsageSummary,
} from '@/components/resume-studio/studio-api';

const MAX_DOCUMENTS = 10;
const STYLE_SAVE_DELAY_MS = 600;

/* ── Tokens the shared palette does not carry ──────────────────────────────
   design.ts covers the sans and mono faces plus the semantic ramp. These are
   the display face and the handful of mockup values with no token, kept here
   with a reason each so no raw hex appears inside the markup below. */

/** Display face for the page title and card titles. */
const SERIF_STACK = "'IBM Plex Serif', Georgia, 'Times New Roman', serif";
/** Recessed ground the paper floats on; darker than canvas so white reads as paper. */
const PREVIEW_WELL = '#dedbd0';
/** The two middle grade bands: success is too green for solid, warn too dark for a badge. */
const GRADE_SOLID = '#2f8f6a';
const GRADE_FAIR = '#c99a2e';
/** Dashed "new document" border. */
const DASHED_BORDER = '#c9cdc4';
/** Custom scrollbar thumb. */
const SCROLL_THUMB = '#d3d0c6';
/** Add button hairline, one step softer than the accent. */
const ADD_BTN_BORDER = '#cfe0da';
/** Neutral hover fill for icon buttons. */
const ICON_HOVER = '#f7f4ec';

/* ── Shared style objects ───────────────────────────────────────────────── */

const railCard: CSSProperties = {
  background: studioColors.surface,
  border: `1px solid ${studioColors.borderStrong}`,
  borderRadius: '14px',
};

const controlLabel: CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '.9px',
  textTransform: 'uppercase',
  color: studioColors.textFaint,
  marginBottom: '8px',
};

const primaryButton: CSSProperties = {
  background: studioColors.accent,
  color: '#fff',
  border: 'none',
  borderRadius: '9px',
  padding: '9px 16px',
  fontSize: '13.5px',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
};

const outlineButton: CSSProperties = {
  border: `1px solid ${studioColors.accent}`,
  color: studioColors.accent,
  background: studioColors.surface,
  borderRadius: '8px',
  padding: '7px 14px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const iconButton: CSSProperties = {
  border: `1px solid ${studioColors.borderSoft}`,
  background: studioColors.surface,
  borderRadius: '7px',
  width: '28px',
  height: '28px',
  color: studioColors.textSoft,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};

const pillOn: CSSProperties = {
  border: 'none',
  background: studioColors.accent,
  color: '#fff',
  borderRadius: '7px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const pillOff: CSSProperties = {
  border: `1px solid ${studioColors.border}`,
  background: studioColors.surface,
  color: studioColors.textBody,
  borderRadius: '7px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const cardTitle: CSSProperties = {
  fontFamily: SERIF_STACK,
  fontSize: '16px',
  fontWeight: 600,
  color: studioColors.text,
  margin: 0,
};

/* ── Stylesheet (media queries, hover, focus, motion) ───────────────────── */

const STUDIO_CSS = `
/* --rs-nav is the site header's fixed footprint (an 18px strip, a 64px pill,
   and another 18px strip). Every sticky offset in the studio is measured from
   it so nothing can slide underneath the navigation. */
/* NO viewport-based min-height here. Any vh math is a guess about the chrome
   above this element (fixed nav strip plus the main pt-4), and guessing high
   makes the document taller than its content, which renders as dead canvas
   below the footer. The layout wrapper is already min-height:100vh with
   main flex:1, so the footer sits at the bottom without help, and the panes
   below are viewport-capped so this is never visually short. */
.rs-root{--rs-nav:100px;--rs-top:185px;background:${studioColors.canvas};font-family:${studioFontStack};color:${studioColors.text}}
.rs-root *{box-sizing:border-box}
/* Wide working surface: this is a three pane editor, so it uses the viewport
   rather than a prose column. The cap only stops absurd stretching on ultra
   wide monitors; the preview pane is weighted heaviest so the paper can reach
   its natural 816px (scale 1) instead of always rendering shrunken. */
/* Width formula mirrors the site header pill EXACTLY, so the studio's left and
   right edges line up with the nav above it at every viewport:
   header = min(100vw - 32px wrapper padding, clamp(1360px, 96vw, 1860px)). */
.rs-container{width:min(calc(100vw - 32px),clamp(1360px,96vw,1860px));max-width:100%;margin:0 auto;padding:18px 0 0}
/* Column order: design rail, then the editor (which owns the in-place
   preview toggle), then the AI rail. */
.rs-grid{display:grid;grid-template-columns:320px minmax(0,1fr) 360px;gap:20px;align-items:start;padding-bottom:40px}
.rs-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;display:inline-block}
.rs-pulse{animation:crPulse 1.1s ease-in-out infinite}
@keyframes crPulse{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.rs-pulse{animation:none}}
/* --rs-top is everything above the panes: the fixed nav (100), the dashboard
   main's pt-4 (16), this container's padding (14), and the single line toolbar
   with its margin (55). Form pane and rail share it so they end level. */
/* position:relative makes this pane the containing block for any absolutely
   positioned descendant, so the pane's own overflow-y:auto clips it. Without
   it, an abs descendant resolves against the layout wrapper (app/layout.tsx,
   position:relative) and escapes every studio clip, free to paint below the
   footer. Safe for the sticky rail: that warning (bottom of this sheet) is
   about OVERFLOW on rail ancestors, and this pane is the rail's sibling. */
.rs-scrollpane{position:relative;max-height:calc(100vh - var(--rs-top));overflow-y:auto}
.rs-form{padding-right:6px;display:flex;flex-direction:column;gap:16px}
.rs-well{background:${PREVIEW_WELL};border-radius:14px;padding:16px}
/* max-height must subtract the sticky offset itself, or the rail's box can end
   below the viewport and spill past the footer. (Historical note: body used to
   be a nested scroll container — globals.css set overflow-x:hidden on it, which
   made overflow-y compute to auto — so any spill became an INVISIBLE second
   scrollable area: wheel input chained into it and the footer floated
   mid-viewport with studio canvas painting below it. globals.css now uses
   overflow-x:clip on body, which keeps html the only page scroller and lets
   this rail's position:sticky anchor to the viewport as designed.) */
.rs-rail{position:sticky;top:calc(var(--rs-nav) + 16px);display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - var(--rs-nav) - 32px);overflow-y:auto;min-height:0}
.rs-seg{display:none}
.rs-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}

.cr-scroll::-webkit-scrollbar{width:9px}
.cr-scroll::-webkit-scrollbar-thumb{background:${SCROLL_THUMB};border-radius:9px;border:2px solid ${studioColors.canvas}}

.rs-btn:focus-visible,.rs-root a:focus-visible,.rs-root input:focus-visible{outline:2px solid ${studioColors.accent};outline-offset:2px}
.rs-btn:active{transform:translateY(1px)}
.rs-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
.rs-primary:hover:not(:disabled){background:${studioColors.accentDark}}
.rs-outline:hover:not(:disabled){background:${studioColors.accentWash}}
.rs-icon:hover:not(:disabled){background:${ICON_HOVER}}
.rs-icon-danger:hover:not(:disabled){background:${studioColors.warnWash}}
.rs-pill-off:hover:not(:disabled){background:${studioColors.well}}
.rs-tpl:hover:not(:disabled){border-color:${ADD_BTN_BORDER}}
.rs-doc-card{transition:border-color .15s,background-color .15s}
.rs-doc-card:hover,.rs-doc-card:focus-within{border-color:${studioColors.accent};background:${studioColors.surfaceAlt}}
.rs-rename-input{width:100%;min-width:0;border:1px solid ${studioColors.border};background:${studioColors.surfaceAlt};border-radius:9px;padding:7px 10px;font-size:13.5px;font-family:inherit;color:${studioColors.text}}
.rs-rename-input:focus{outline:none;border-color:${studioColors.accent};box-shadow:0 0 0 3px rgba(13,107,98,.12)}

@keyframes crIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes crRing{from{stroke-dashoffset:var(--c)}}
@keyframes crBar{from{width:0}}
@keyframes crPulse{0%,100%{opacity:1}50%{opacity:.5}}
.rs-in{animation:crIn .3s ease}

@media (max-width:1279px){
  /* Two columns: the design rail stays put, the second column tabs between
     the editor and the AI rail. The preview needs no tab at any width: it
     lives inside the editor pane behind the Preview toggle. */
  .rs-grid{grid-template-columns:320px minmax(0,1fr)}
  .rs-seg{display:flex;position:sticky;top:var(--rs-nav);z-index:20;background:${studioColors.canvas};padding:8px 0;border-bottom:1px solid ${studioColors.border};gap:10px;align-items:center;margin-bottom:12px}
  .rs-grid[data-pane="edit"] .rs-pane-insights{display:none}
  .rs-grid[data-pane="insights"] .rs-pane-edit{display:none}
}
@media (max-width:1023px){
  /* Extra bottom room clears the mobile bottom navigation bar. */
  .rs-grid{grid-template-columns:minmax(0,1fr);padding-bottom:88px}
  .rs-scrollpane{max-height:none;overflow:visible}
  .rs-form{padding-right:0}
  .rs-rail{position:static;max-height:none;overflow:visible}
  .rs-grid[data-pane="edit"] .rs-pane-design{display:none}
  .rs-grid[data-pane="edit"] .rs-pane-insights{display:none}
  .rs-grid[data-pane="design"] .rs-pane-edit{display:none}
  .rs-grid[data-pane="design"] .rs-pane-insights{display:none}
  .rs-grid[data-pane="insights"] .rs-pane-edit{display:none}
  .rs-grid[data-pane="insights"] .rs-pane-design{display:none}
}
@media (max-width:767px){
  /* The width formula already provides the 16px gutter that matches the nav,
     so no extra horizontal padding here. */
  .rs-container{padding:12px 0 0}
  .rs-well{padding:10px}
  .rs-grid{gap:12px}
  .rs-lib-grid{grid-template-columns:minmax(0,1fr)}
  /* Toolbar stacks: the title takes the first row, the actions a full width
     row beneath it, so neither truncates to nothing on a narrow phone. */
  .rs-toolbar{flex-direction:column;align-items:stretch;gap:10px}
  .rs-toolbar-actions{width:100%}
  .rs-toolbar-actions .rs-btn{flex:1 1 auto;justify-content:center}
}
/* Guard against sideways overflow with max-width only. An overflow value other
   than visible on these ancestors would make them the scroll container and
   silently kill the sticky rail, so it is deliberately NOT set here; the panes
   already carry min-width:0, which is what actually contains grid children. */
.rs-root,.rs-container,.rs-grid{max-width:100%}
@media (prefers-reduced-motion:reduce){
  .rs-root *,.rs-root *::before,.rs-root *::after{
    animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;
  }
}
`;

/* ── Helpers ────────────────────────────────────────────────────────────── */

function toSummary(doc: ResumeDocument): ResumeDocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    template: doc.template,
    isDefault: doc.isDefault,
    updatedAt: doc.updatedAt,
  };
}

/** Relative wording for the resume cards, with no dash characters. */
function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'recently';
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 1) return `yesterday at ${time}`;
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const GRADE_COLOR: Record<ResumeGrade, string> = {
  strong: studioColors.success,
  solid: GRADE_SOLID,
  'needs-work': GRADE_FAIR,
  critical: studioColors.danger,
};

interface ThumbBars {
  hdr: CSSProperties;
  nameBar: CSSProperties;
  subBar: CSSProperties;
  headBar: CSSProperties;
}

/** Mini paper thumbnails for the template picker, one shape per template. */
function thumbBars(id: ResumeTemplateId, accent: string): ThumbBars {
  const bar = (width: string, height: number, background: string): CSSProperties => ({
    height: `${height}px`,
    width,
    background,
    borderRadius: '2px',
  });
  switch (id) {
    case 'modern':
      return {
        hdr: { padding: '8px' },
        nameBar: bar('55%', 7, accent),
        subBar: { ...bar('30%', 3, accent), opacity: 0.6, marginTop: '3px' },
        headBar: bar('30%', 3, accent),
      };
    case 'minimal':
      return {
        hdr: { padding: '8px', borderBottom: `1px solid ${studioColors.border}` },
        nameBar: bar('50%', 5, studioColors.textBody),
        subBar: { ...bar('30%', 3, DASHED_BORDER), marginTop: '3px' },
        headBar: bar('28%', 3, DASHED_BORDER),
      };
    case 'enterprise':
      return {
        hdr: { padding: '9px 8px', background: accent },
        nameBar: bar('55%', 6, studioColors.surface),
        subBar: { ...bar('35%', 3, 'rgba(255,255,255,.6)'), marginTop: '3px' },
        headBar: bar('30%', 3, accent),
      };
    case 'executive':
      return {
        hdr: {
          padding: '8px',
          textAlign: 'center',
          borderTop: `2px solid ${accent}`,
          borderBottom: `2px solid ${accent}`,
        },
        nameBar: { ...bar('60%', 5, studioColors.textBody), margin: '0 auto' },
        subBar: { ...bar('34%', 3, accent), margin: '3px auto 0' },
        headBar: { ...bar('30%', 3, accent), margin: '0 auto' },
      };
    default:
      return {
        hdr: { padding: '9px 8px 7px', textAlign: 'center', borderBottom: `2px solid ${accent}` },
        nameBar: { ...bar('55%', 5, studioColors.textBody), margin: '0 auto' },
        subBar: { ...bar('35%', 3, accent), margin: '3px auto 0' },
        headBar: bar('34%', 3, accent),
      };
  }
}

/* ── Design controls (template, font, density, paper) ───────────────────── */

interface DesignControlsProps {
  templateId: ResumeTemplateId;
  config: ResumeStyleConfig;
  onTemplate: (id: ResumeTemplateId) => void;
  onStyle: (patch: Partial<ResumeStyleConfig>) => void;
}

/**
 * The presentation controls, as a rail card above the insight rail. Every
 * change applies to the sheet in the same frame and is debounced to a PATCH by
 * the shell, so the preview and the export never disagree for longer than one
 * failed request.
 */
function DesignControls({ templateId, config, onTemplate, onStyle }: DesignControlsProps) {
  const activeFont = RESUME_FONTS.find((f) => f.id === config.font) ?? RESUME_FONTS[0];

  return (
    <section style={{ ...railCard, padding: '14px' }} aria-labelledby="rs-design-heading">
      <h2 id="rs-design-heading" style={{ ...cardTitle, marginBottom: '12px' }}>
        Design
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <div style={controlLabel} id="rs-tpl-label">
            Template
          </div>
          <div
            role="group"
            aria-labelledby="rs-tpl-label"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}
          >
            {RESUME_TEMPLATES.map((tpl) => {
              const accent = tpl.accent || studioColors.ink;
              const selected = tpl.id === templateId;
              const bars = thumbBars(tpl.id, accent);
              const line: CSSProperties = {
                height: '3px',
                width: '82%',
                background: studioColors.wellAlt,
                borderRadius: '2px',
              };
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className="rs-btn rs-tpl"
                  onClick={() => onTemplate(tpl.id)}
                  aria-pressed={selected}
                  title={tpl.blurb}
                  style={{
                    border: `1.5px solid ${selected ? accent : studioColors.border}`,
                    background: studioColors.surface,
                    borderRadius: '9px',
                    overflow: 'hidden',
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: selected ? `0 0 0 2px ${accent}33` : 'none',
                  }}
                >
                  <div style={bars.hdr}>
                    <div style={bars.nameBar} />
                    <div style={bars.subBar} />
                  </div>
                  <div style={{ padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={bars.headBar} />
                    <div style={line} />
                    <div style={{ ...line, width: '55%' }} />
                    <div style={{ ...bars.headBar, marginTop: '2px' }} />
                    <div style={line} />
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'center',
                      padding: '5px 4px 6px',
                      color: selected ? accent : studioColors.textBody,
                      borderTop: `1px solid ${studioColors.well}`,
                      background: selected ? `${accent}12` : studioColors.surfaceAlt,
                    }}
                  >
                    {tpl.label}
                  </div>
                </button>
              );
            })}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: studioColors.textFaint, lineHeight: 1.45 }}>
            {RESUME_TEMPLATES.find((t) => t.id === templateId)?.blurb}
          </p>
        </div>

        <div>
          <div style={controlLabel} id="rs-font-label">
            Heading font
          </div>
          <div
            role="group"
            aria-labelledby="rs-font-label"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}
          >
            {RESUME_FONTS.map((font) => {
              const selected = font.id === config.font;
              return (
                <button
                  key={font.id}
                  type="button"
                  className={`rs-btn ${selected ? '' : 'rs-pill-off'}`}
                  aria-pressed={selected}
                  onClick={() => onStyle({ font: font.id })}
                  style={{
                    ...(selected ? pillOn : pillOff),
                    fontFamily: font.cssStack,
                    fontSize: '13px',
                    textAlign: 'center',
                  }}
                >
                  {font.label}
                </button>
              );
            })}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: studioColors.textFaint, lineHeight: 1.45 }}>
            PDF export maps this to {activeFont.pdfFamily} so applicant tracking systems parse it reliably.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={controlLabel} id="rs-density-label">
              Density
            </div>
            <div role="group" aria-labelledby="rs-density-label" style={{ display: 'flex', gap: '6px' }}>
              {RESUME_DENSITIES.map((density) => {
                const selected = density.id === config.density;
                return (
                  <button
                    key={density.id}
                    type="button"
                    className={`rs-btn ${selected ? '' : 'rs-pill-off'}`}
                    aria-pressed={selected}
                    onClick={() => onStyle({ density: density.id })}
                    style={selected ? pillOn : pillOff}
                  >
                    {density.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={controlLabel} id="rs-paper-label">
              Paper size
            </div>
            <div role="group" aria-labelledby="rs-paper-label" style={{ display: 'flex', gap: '7px' }}>
              {RESUME_PAPERS.map((paper) => {
                const selected = paper.id === config.paper;
                return (
                  <button
                    key={paper.id}
                    type="button"
                    className={`rs-btn ${selected ? '' : 'rs-pill-off'}`}
                    aria-pressed={selected}
                    onClick={() => onStyle({ paper: paper.id })}
                    style={selected ? pillOn : pillOff}
                  >
                    {paper.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Score badge on a resume card ───────────────────────────────────────── */

function ScoreBadge({ score }: { score: ResumeScoreResult | undefined }) {
  if (!score) return null;
  return (
    <div style={{ textAlign: 'center', flexShrink: 0 }}>
      <div
        style={{
          fontFamily: studioMonoStack,
          fontWeight: 600,
          fontSize: '19px',
          lineHeight: 1,
          color: GRADE_COLOR[score.grade],
        }}
      >
        {score.total}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: studioColors.textFaint,
          textTransform: 'uppercase',
          letterSpacing: '.6px',
          marginTop: '2px',
        }}
      >
        ATS
      </div>
    </div>
  );
}

/* ── Shell ──────────────────────────────────────────────────────────────── */

type ListState = 'loading' | 'ready' | 'error';
type DocState = 'idle' | 'loading' | 'error';
type Pane = 'design' | 'edit' | 'insights';
type DocumentsResult = Awaited<ReturnType<typeof listDocuments>>;
type UsageResult = Awaited<ReturnType<typeof getUsage>>;

export default function ResumeStudio() {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<ResumeDocumentSummary[]>([]);
  const [listState, setListState] = useState<ListState>('loading');
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<ResumeDocument | null>(null);
  const [docState, setDocState] = useState<DocState>('idle');
  const requestSeqRef = useRef(0);

  const [creating, setCreating] = useState<'profile' | 'blank' | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pane, setPane] = useState<Pane>('edit');
  /** In-place preview: the editor column swaps between the form and the
   *  rendered sheet. Both stay MOUNTED (hidden via display) so SectionEditor's
   *  debounced autosave and in-flight edits survive the toggle. */
  const [centerView, setCenterView] = useState<'edit' | 'preview'>('edit');
  const [scores, setScores] = useState<Record<string, ResumeScoreResult>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /** Lifted from SectionEditor so the toolbar owns the one save indicator. */
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Layout awareness is used only to keep the ARIA wiring honest (a tab panel
  // needs a tab). Which pane is visible is decided in CSS, so there is no
  // flash of the wrong layout before hydration.
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  // Focus management for the inline rename and delete-confirm rows: keep the
  // control that opened each step so focus can return to it, and focus into the
  // confirm step when it appears instead of letting focus fall to the body.
  const renameTriggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  /** The library collapses when a resume is opened, so focus goes back to the
   *  control that expanded it instead of falling to the body. */
  const libraryToggleRef = useRef<HTMLButtonElement | null>(null);

  const focusAfterRender = (getEl: () => HTMLElement | null | undefined) => {
    requestAnimationFrame(() => getEl()?.focus());
  };

  // ── Presentation style plumbing ────────────────────────────────────────────
  // Declared next to the document state because a document load is what seeds
  // the "last confirmed" presentation a failed style write rolls back to.

  const styleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStyleRef = useRef<{ docId: string; template: ResumeTemplateId; config: ResumeStyleConfig } | null>(
    null,
  );
  /** Last presentation the server confirmed, per document id. */
  const confirmedStyleRef = useRef<Record<string, { template: ResumeTemplate; config: ResumeStyleConfig }>>({});

  function rememberConfirmedStyle(doc: ResumeDocument) {
    confirmedStyleRef.current[doc.id] = {
      template: doc.template,
      config: resolveResumeStyle(doc.template, doc.styleConfig).config,
    };
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const collapsed = window.matchMedia('(max-width: 1279px)');
    const narrow = window.matchMedia('(max-width: 1023px)');
    const sync = () => {
      setIsCollapsed(collapsed.matches);
      setIsNarrow(narrow.matches);
    };
    sync();
    collapsed.addEventListener('change', sync);
    narrow.addEventListener('change', sync);
    return () => {
      collapsed.removeEventListener('change', sync);
      narrow.removeEventListener('change', sync);
    };
  }, []);

  // ── Loading ────────────────────────────────────────────────────────────────

  const loadDocument = useCallback(async (id: string) => {
    const seq = ++requestSeqRef.current;
    setDocState('loading');
    const res = await getDocument(id);
    if (seq !== requestSeqRef.current) return;
    if (res.ok) {
      setSelectedDoc(res.data.document);
      rememberConfirmedStyle(res.data.document);
      setDocState('idle');
    } else {
      setDocState('error');
    }
  }, []);

  const applyLoaded = useCallback(
    (docsRes: DocumentsResult, usageRes: UsageResult) => {
      if (docsRes.ok) {
        const docs = docsRes.data.documents;
        setDocuments(docs);
        setListState('ready');
        const initial = docs.find((d) => d.isDefault) ?? docs[0];
        if (initial) {
          setSelectedId(initial.id);
          void loadDocument(initial.id);
        }
      } else {
        setListState('error');
      }
      if (usageRes.ok) {
        setUsage(usageRes.data.usage);
      }
    },
    [loadDocument],
  );

  /** Retry path. The caller shows the loading state before calling this. */
  const loadAll = useCallback(async () => {
    const [docsRes, usageRes] = await Promise.all([listDocuments(), getUsage()]);
    applyLoaded(docsRes, usageRes);
  }, [applyLoaded]);

  // First load. State is set from the promise callback rather than in the
  // effect body, so mounting does not cascade an extra render.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listDocuments(), getUsage()]).then(([docsRes, usageRes]) => {
      if (!cancelled) applyLoaded(docsRes, usageRes);
    });
    return () => {
      cancelled = true;
    };
  }, [applyLoaded]);

  // When the delete-confirm step appears, move focus into it (to "Yes, delete")
  // so the destructive choice is where the keyboard and screen reader land.
  useEffect(() => {
    if (confirmDeleteId) confirmDeleteButtonRef.current?.focus();
  }, [confirmDeleteId]);

  const selectDocument = (id: string) => {
    if (libraryOpen) {
      setLibraryOpen(false);
      focusAfterRender(() => libraryToggleRef.current);
    }
    if (id === selectedId && selectedDoc?.id === id && docState !== 'error') return;
    setSelectedId(id);
    setSavedAt(null);
    void loadDocument(id);
  };

  /** Adopt a full document we already have (create or duplicate), no refetch. */
  const adoptDocument = (doc: ResumeDocument) => {
    requestSeqRef.current += 1; // cancel any in-flight fetch
    const summary = toSummary(doc);
    setDocuments((prev) => {
      const others = prev
        .filter((d) => d.id !== doc.id)
        .map((d) => (doc.isDefault && d.isDefault ? { ...d, isDefault: false } : d));
      return [...others, summary];
    });
    setSelectedId(doc.id);
    setSelectedDoc(doc);
    rememberConfirmedStyle(doc);
    setDocState('idle');
    setSavedAt(null);
  };

  // ── Document actions ───────────────────────────────────────────────────────

  const handleCreate = async (seedFromProfile: boolean) => {
    if (creating) return;
    setCreating(seedFromProfile ? 'profile' : 'blank');
    const res = await createDocument({ seedFromProfile });
    if (res.ok) {
      adoptDocument(res.data.document);
      setLibraryOpen(false);
      toast('Resume created', 'success');
    } else if (res.status === 409) {
      toast(res.message ?? `You can keep up to ${MAX_DOCUMENTS} resumes. Delete one to make room.`, 'error');
    } else {
      toast(res.message ?? 'Could not create the resume. Please try again.', 'error');
    }
    setCreating(null);
  };

  const handleDuplicate = async (id: string) => {
    if (busyDocId) return;
    setBusyDocId(id);
    const res = await duplicateDocument(id);
    if (res.ok) {
      adoptDocument(res.data.document);
      toast('Copy created', 'success');
    } else if (res.status === 409) {
      toast(res.message ?? `You can keep up to ${MAX_DOCUMENTS} resumes. Delete one to make room.`, 'error');
    } else {
      toast(res.message ?? 'Could not duplicate the resume.', 'error');
    }
    setBusyDocId(null);
  };

  const handleDelete = async (id: string) => {
    if (busyDocId) return;
    setBusyDocId(id);
    const res = await deleteDocument(id);
    if (res.ok) {
      const remaining = documents.filter((d) => d.id !== id);
      setDocuments(remaining);
      setConfirmDeleteId(null);
      setScores((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (selectedId === id) {
        const next = remaining[0];
        if (next) {
          setSelectedId(next.id);
          void loadDocument(next.id);
        } else {
          requestSeqRef.current += 1;
          setSelectedId(null);
          setSelectedDoc(null);
          setDocState('idle');
        }
      }
      toast('Resume deleted', 'success');
    } else {
      toast(res.message ?? 'Could not delete the resume.', 'error');
    }
    setBusyDocId(null);
  };

  const startRename = (doc: ResumeDocumentSummary) => {
    setRenamingId(doc.id);
    setRenameDraft(doc.title);
  };

  const commitRename = async (id: string) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    focusAfterRender(() => renameTriggerRefs.current.get(id));
    if (!title || title === documents.find((d) => d.id === id)?.title) return;
    const res = await updateDocument(id, { title });
    if (res.ok) {
      const saved = res.data.document;
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, title: saved.title, updatedAt: saved.updatedAt } : d)));
      setSelectedDoc((prev) => (prev && prev.id === id ? { ...prev, title: saved.title, updatedAt: saved.updatedAt } : prev));
    } else {
      toast(res.message ?? 'Could not rename the resume.', 'error');
    }
  };

  const handleSetDefault = async (id: string) => {
    const res = await updateDocument(id, { isDefault: true });
    if (res.ok) {
      setDocuments((prev) => prev.map((d) => ({ ...d, isDefault: d.id === id })));
      setSelectedDoc((prev) => (prev ? { ...prev, isDefault: prev.id === id } : prev));
      toast('Default resume updated', 'success');
    } else {
      toast(res.message ?? 'Could not set the default resume.', 'error');
    }
  };

  // ── Shared editor and rail callbacks ───────────────────────────────────────

  const handleSectionsChange = (sections: ResumeSections, docId: string) => {
    // Ignore a deferred write whose document is no longer selected, so a late
    // callback from a previously edited resume cannot cross over and corrupt the
    // document now on screen.
    setSelectedDoc((prev) => (prev && prev.id === docId ? { ...prev, sections } : prev));
  };

  const handleTemplateChange = (template: ResumeTemplate, docId: string) => {
    setSelectedDoc((prev) => (prev && prev.id === docId ? { ...prev, template } : prev));
    setDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, template } : d)));
  };

  /** After a successful PATCH, sync list metadata only; never clobber the working sections copy. */
  const handleSaved = (doc: ResumeDocument) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, title: doc.title, template: doc.template, isDefault: doc.isDefault, updatedAt: doc.updatedAt }
          : d,
      ),
    );
    if (doc.id === selectedId) setSavedAt(doc.updatedAt);
  };

  const handleFeatureUsage = (key: keyof UsageSummary, featureUsage: FeatureUsage) => {
    setUsage((prev) => (prev ? { ...prev, [key]: featureUsage } : prev));
  };

  /** The rail owns scoring; the shell keeps the last known score per document
   *  so the library cards can show an ATS badge. */
  const handleScore = (score: ResumeScoreResult, docId: string) => {
    setScores((prev) => (prev[docId]?.total === score.total ? prev : { ...prev, [docId]: score }));
  };

  // ── Presentation style ─────────────────────────────────────────────────────

  const selectedTemplate = selectedDoc?.template;
  const selectedStyleConfig = selectedDoc?.styleConfig;
  const resolved = useMemo(
    () => resolveResumeStyle(selectedTemplate, selectedStyleConfig),
    [selectedTemplate, selectedStyleConfig],
  );

  useEffect(() => () => {
    if (styleTimerRef.current) clearTimeout(styleTimerRef.current);
  }, []);

  const persistStyle = async () => {
    const pending = pendingStyleRef.current;
    pendingStyleRef.current = null;
    if (!pending) return;
    const res = await updateDocument(pending.docId, {
      template: pending.template,
      styleConfig: pending.config,
    });
    if (res.ok) {
      confirmedStyleRef.current[pending.docId] = { template: pending.template, config: pending.config };
      handleSaved(res.data.document);
      return;
    }
    // Roll back to the last confirmed presentation so the sheet on screen and
    // the sheet the export will produce cannot disagree.
    const confirmed = confirmedStyleRef.current[pending.docId];
    if (confirmed) {
      setSelectedDoc((prev) =>
        prev && prev.id === pending.docId
          ? { ...prev, template: confirmed.template, styleConfig: confirmed.config }
          : prev,
      );
      setDocuments((prev) =>
        prev.map((d) => (d.id === pending.docId ? { ...d, template: confirmed.template } : d)),
      );
    }
    toast(res.message ?? 'Could not save the design change.', 'error');
  };

  const scheduleStyleSave = (docId: string, template: ResumeTemplateId, config: ResumeStyleConfig) => {
    pendingStyleRef.current = { docId, template, config };
    if (styleTimerRef.current) clearTimeout(styleTimerRef.current);
    styleTimerRef.current = setTimeout(() => {
      void persistStyle();
    }, STYLE_SAVE_DELAY_MS);
  };

  const applyTemplate = (id: ResumeTemplateId) => {
    const doc = selectedDoc;
    if (!doc || id === doc.template) return;
    const next = resolveResumeStyle(id, doc.styleConfig).config;
    setSelectedDoc((prev) => (prev && prev.id === doc.id ? { ...prev, template: id, styleConfig: next } : prev));
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, template: id } : d)));
    scheduleStyleSave(doc.id, id, next);
  };

  const applyStyle = (patch: Partial<ResumeStyleConfig>) => {
    const doc = selectedDoc;
    if (!doc) return;
    const current = resolveResumeStyle(doc.template, doc.styleConfig).config;
    const next: ResumeStyleConfig = { ...current, ...patch };
    setSelectedDoc((prev) => (prev && prev.id === doc.id ? { ...prev, styleConfig: next } : prev));
    scheduleStyleSave(doc.id, resolveResumeStyle(doc.template, doc.styleConfig).template.id, next);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const atCap = documents.length >= MAX_DOCUMENTS;
  const capTitle = atCap ? `You already have ${MAX_DOCUMENTS} resumes. Delete one to make room.` : undefined;

  const paneTabs: { id: Pane; label: string }[] = isNarrow
    ? [
        { id: 'design', label: 'Design' },
        { id: 'edit', label: 'Edit' },
        { id: 'insights', label: 'AI & Score' },
      ]
    : [
        { id: 'edit', label: 'Edit' },
        { id: 'insights', label: 'AI & Score' },
      ];

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = paneTabs.findIndex((t) => t.id === pane);
    if (index < 0) return;
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % paneTabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + paneTabs.length) % paneTabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = paneTabs.length - 1;
    else return;
    e.preventDefault();
    setPane(paneTabs[next].id);
    focusAfterRender(() => document.getElementById(`rs-tab-${paneTabs[next].id}`));
  };

  const selectedScore = selectedId ? scores[selectedId] : undefined;

  const renderDocumentCard = (doc: ResumeDocumentSummary) => {
    const isBusy = busyDocId === doc.id;
    const isSelected = doc.id === selectedId;
    return (
      <li
        key={doc.id}
        className="rs-doc-card"
        style={{
          border: `1px solid ${isSelected ? studioColors.accent : studioColors.borderStrong}`,
          borderRadius: '12px',
          padding: '15px 17px',
          background: isSelected ? studioColors.surfaceAlt : studioColors.surface,
          listStyle: 'none',
        }}
      >
        {renamingId === doc.id ? (
          <div role="group" aria-label={`Rename ${doc.title || 'resume'}`} style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename(doc.id);
                if (e.key === 'Escape') {
                  setRenamingId(null);
                  focusAfterRender(() => renameTriggerRefs.current.get(doc.id));
                }
              }}
              autoFocus
              aria-label="Resume title"
              className="rs-rename-input"
            />
            <button
              type="button"
              className="rs-btn rs-icon"
              onClick={() => void commitRename(doc.id)}
              aria-label="Save title"
              style={{ ...iconButton, color: studioColors.accent }}
            >
              <Check size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rs-btn rs-icon"
              onClick={() => {
                setRenamingId(null);
                focusAfterRender(() => renameTriggerRefs.current.get(doc.id));
              }}
              aria-label="Cancel rename"
              style={iconButton}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: studioColors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {doc.title || 'Untitled resume'}
                </span>
                {doc.isDefault && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      color: studioColors.accentDark,
                      background: studioColors.accentWash,
                      borderRadius: '5px',
                      padding: '2px 7px',
                    }}
                  >
                    <Star size={10} aria-hidden="true" /> DEFAULT
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12.5px', color: studioColors.textFaint, marginTop: '3px' }}>
                Updated {formatUpdated(doc.updatedAt)}
              </div>
            </div>
            <ScoreBadge score={scores[doc.id]} />
            <button
              type="button"
              className="rs-btn rs-outline"
              onClick={() => selectDocument(doc.id)}
              style={outlineButton}
              aria-current={isSelected ? 'true' : undefined}
            >
              {isSelected ? 'Editing' : 'Edit'}
            </button>
          </div>
        )}

        {confirmDeleteId === doc.id ? (
          <div
            role="alertdialog"
            aria-label={`Delete ${doc.title || 'resume'}?`}
            style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: studioColors.danger }}>
              Delete this resume?
            </span>
            <button
              type="button"
              ref={confirmDeleteButtonRef}
              className="rs-btn"
              onClick={() => void handleDelete(doc.id)}
              disabled={isBusy}
              style={{ ...primaryButton, background: studioColors.danger, padding: '6px 12px', fontSize: '12.5px' }}
            >
              {isBusy ? 'Deleting...' : 'Yes, delete'}
            </button>
            <button
              type="button"
              className="rs-btn rs-outline"
              onClick={() => {
                setConfirmDeleteId(null);
                focusAfterRender(() => deleteTriggerRefs.current.get(doc.id));
              }}
              style={{ ...outlineButton, borderColor: studioColors.border, color: studioColors.textBody }}
            >
              Cancel
            </button>
          </div>
        ) : (
          renamingId !== doc.id && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '4px' }}>
              <button
                type="button"
                ref={(el) => {
                  renameTriggerRefs.current.set(doc.id, el);
                }}
                className="rs-btn rs-icon"
                onClick={() => startRename(doc)}
                aria-label={`Rename ${doc.title || 'resume'}`}
                title="Rename"
                style={iconButton}
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="rs-btn rs-icon"
                onClick={() => void handleDuplicate(doc.id)}
                disabled={isBusy || atCap}
                aria-label={`Duplicate ${doc.title || 'resume'}`}
                title={capTitle ?? 'Duplicate'}
                style={iconButton}
              >
                {isBusy ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
              </button>
              {!doc.isDefault && (
                <button
                  type="button"
                  className="rs-btn rs-icon"
                  onClick={() => void handleSetDefault(doc.id)}
                  aria-label={`Make ${doc.title || 'resume'} the default`}
                  title="Make default"
                  style={iconButton}
                >
                  <Star size={13} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                ref={(el) => {
                  deleteTriggerRefs.current.set(doc.id, el);
                }}
                className="rs-btn rs-icon rs-icon-danger"
                onClick={() => setConfirmDeleteId(doc.id)}
                aria-label={`Delete ${doc.title || 'resume'}`}
                title="Delete"
                style={{ ...iconButton, color: studioColors.danger }}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          )
        )}
      </li>
    );
  };

  const newDocumentControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        type="button"
        className="rs-btn"
        onClick={() => void handleCreate(true)}
        disabled={creating !== null || atCap}
        title={capTitle}
        style={{
          border: `1.5px dashed ${DASHED_BORDER}`,
          background: studioColors.surfaceAlt,
          color: studioColors.textBody,
          borderRadius: '12px',
          padding: '14px',
          fontSize: '13.5px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {creating === 'profile' ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles size={16} aria-hidden="true" />
        )}
        New from profile
      </button>
      <button
        type="button"
        className="rs-btn"
        onClick={() => void handleCreate(false)}
        disabled={creating !== null || atCap}
        title={capTitle}
        style={{
          border: 'none',
          background: 'none',
          color: studioColors.accent,
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        {creating === 'blank' ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Plus size={14} aria-hidden="true" />
        )}
        Start blank
      </button>
    </div>
  );

  return (
    <div className="rs-root">
      <style dangerouslySetInnerHTML={{ __html: STUDIO_CSS }} />

      <div className="rs-container">
        {/* ── Toolbar ── */}
        <div
          className="rs-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          {/* Title and the open document sit on ONE line. The live save state
              lives in the form pane (SectionEditor owns it); repeating it here
              produced two competing autosave lines. */}
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
            {/* The nav already says Resume, so the page heading is the open
                document. Keeping a real h1 preserves the document outline. */}
            <h1
              style={{
                fontFamily: SERIF_STACK,
                fontWeight: 600,
                fontSize: '22px',
                letterSpacing: '-0.3px',
                margin: 0,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: studioColors.text,
              }}
              title={selectedDoc ? selectedDoc.title || 'Untitled resume' : 'Your resumes'}
            >
              {selectedDoc ? selectedDoc.title || 'Untitled resume' : 'Your resumes'}
            </h1>
            {/* The single save indicator for the whole studio. SectionEditor
                lifts its state here so the toolbar and the form pane cannot
                disagree, and the form pane keeps that row of height. */}
            {selectedDoc && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                  fontSize: '12.5px',
                  color: saveState === 'retrying' ? studioColors.danger : studioColors.textFaint,
                }}
              >
                <span
                  aria-hidden="true"
                  className={saveState === 'saving' ? 'rs-dot rs-pulse' : 'rs-dot'}
                  style={{
                    background: saveState === 'retrying' ? studioColors.danger : studioColors.accent,
                  }}
                />
                <span aria-hidden="true">
                  {saveState === 'saving'
                    ? 'Saving...'
                    : saveState === 'retrying'
                      ? 'Save failed, retrying'
                      : savedAt
                        ? `Saved ${formatUpdated(savedAt)}`
                        : 'Autosave on'}
                </span>
                {/* Announce only terminal states, never the transient Saving. */}
                <span role="status" aria-live="polite" className="sr-only">
                  {saveState === 'saved' ? 'Saved' : saveState === 'retrying' ? 'Save failed, retrying' : ''}
                </span>
              </span>
            )}
          </div>

          <div className="rs-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              ref={libraryToggleRef}
              className="rs-btn rs-outline"
              onClick={() => setLibraryOpen((open) => !open)}
              aria-expanded={libraryOpen}
              aria-controls="rs-library"
              style={outlineButton}
            >
              <FolderOpen size={15} aria-hidden="true" />
              Your resumes
              <span style={{ fontFamily: studioMonoStack, fontSize: '12px', color: studioColors.textFaint }}>
                {documents.length} of {MAX_DOCUMENTS}
              </span>
            </button>
            {selectedDoc && (
              <button
                type="button"
                className="rs-btn rs-outline"
                onClick={() => setCenterView((v) => (v === 'edit' ? 'preview' : 'edit'))}
                aria-pressed={centerView === 'preview'}
                style={outlineButton}
              >
                {centerView === 'preview'
                  ? (<><Pencil size={15} aria-hidden="true" /> Back to editor</>)
                  : (<><Eye size={15} aria-hidden="true" /> Preview</>)}
              </button>
            )}
            {selectedDoc && (
              <a
                className="rs-btn rs-primary"
                href={documentPdfUrl(selectedDoc.id)}
                style={primaryButton}
              >
                <Download size={16} aria-hidden="true" />
                Export PDF
              </a>
            )}
          </div>
        </div>

        {/* ── Library ── */}
        {listState === 'ready' && documents.length > 0 && libraryOpen && (
          <section
            id="rs-library"
            className="rs-in"
            aria-label="Your resumes"
            style={{
              background: studioColors.surface,
              border: `1px solid ${studioColors.borderStrong}`,
              borderRadius: '16px',
              padding: '18px 20px',
              marginBottom: '16px',
              boxShadow: studioShadow.pane,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <h2 style={cardTitle}>Your resumes</h2>
              <span style={{ fontFamily: studioMonoStack, fontSize: '12.5px', color: studioColors.textFaint }}>
                {documents.length} of {MAX_DOCUMENTS}
              </span>
            </div>
            <ul className="rs-lib-grid" style={{ margin: 0, padding: 0 }}>
              {documents.map(renderDocumentCard)}
            </ul>
            <div style={{ marginTop: '12px', maxWidth: '320px' }}>{newDocumentControls}</div>
          </section>
        )}

        {/* ── States ── */}
        {listState === 'loading' && (
          <div
            style={{
              ...railCard,
              padding: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            <Loader2 size={20} className="animate-spin" style={{ color: studioColors.accent }} aria-hidden="true" />
            <span style={{ fontSize: '13.5px', color: studioColors.textMuted }}>Loading your resumes...</span>
          </div>
        )}

        {listState === 'error' && (
          <div style={{ ...railCard, padding: '32px', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: studioColors.text, margin: '0 0 14px' }}>
              Could not load your resumes.
            </p>
            <button
              type="button"
              className="rs-btn rs-primary"
              onClick={() => {
                setListState('loading');
                void loadAll();
              }}
              style={primaryButton}
            >
              <RefreshCw size={16} aria-hidden="true" /> Try again
            </button>
          </div>
        )}

        {listState === 'ready' && documents.length === 0 && (
          <div
            style={{
              border: `1.5px dashed ${DASHED_BORDER}`,
              borderRadius: '12px',
              background: studioColors.surfaceAlt,
              padding: '48px 24px',
              textAlign: 'center',
              maxWidth: '560px',
              margin: '0 auto 40px',
            }}
          >
            <FileText size={40} style={{ color: studioColors.accent }} aria-hidden="true" />
            <h2 style={{ fontFamily: SERIF_STACK, fontSize: '20px', fontWeight: 600, margin: '12px 0 6px' }}>
              Start your first resume
            </h2>
            <p
              style={{
                fontSize: '13.5px',
                color: studioColors.textMuted,
                margin: '0 auto 20px',
                maxWidth: '400px',
                lineHeight: 1.5,
              }}
            >
              We can prefill your licenses, certifications, education, and work history from your PMHNP Hiring
              profile, or you can start from a blank sheet.
            </p>
            <div style={{ maxWidth: '280px', margin: '0 auto' }}>{newDocumentControls}</div>
          </div>
        )}

        {/* ── Three pane editor ── */}
        {listState === 'ready' && documents.length > 0 && (
          <>
            {isCollapsed && (
              <div className="rs-seg">
                <div
                  role="tablist"
                  aria-label="Studio panes"
                  onKeyDown={onTabKeyDown}
                  style={{
                    display: 'flex',
                    flex: 1,
                    background: studioColors.well,
                    borderRadius: '10px',
                    padding: '3px',
                    gap: '3px',
                  }}
                >
                  {paneTabs.map((tab) => {
                    const active = tab.id === pane;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        id={`rs-tab-${tab.id}`}
                        role="tab"
                        aria-selected={active}
                        aria-controls={`rs-pane-${tab.id}`}
                        tabIndex={active ? 0 : -1}
                        className="rs-btn"
                        onClick={() => setPane(tab.id)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          background: active ? studioColors.surface : 'transparent',
                          color: active ? studioColors.accentDark : studioColors.textBody,
                          boxShadow: active ? studioShadow.pane : 'none',
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                {isNarrow && selectedScore && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      border: `2px solid ${GRADE_COLOR[selectedScore.grade]}`,
                      flexShrink: 0,
                    }}
                    role="img"
                    aria-label={`Resume score ${selectedScore.total} out of 100, ${selectedScore.grade}`}
                  >
                    <span
                      style={{
                        fontFamily: studioMonoStack,
                        fontSize: '15px',
                        fontWeight: 600,
                        color: GRADE_COLOR[selectedScore.grade],
                      }}
                    >
                      {selectedScore.total}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="rs-grid" data-pane={pane}>
              {/* Pane 1: design rail. First in the DOM as well as on screen,
                  so keyboard focus travels left to right the way the layout
                  reads. */}
              <div
                className="rs-pane-design rs-rail cr-scroll"
                id="rs-pane-design"
                role={isNarrow ? 'tabpanel' : 'region'}
                aria-labelledby={isNarrow ? 'rs-tab-design' : undefined}
                aria-label={isNarrow ? undefined : 'Design'}
              >
                {docState === 'idle' && selectedDoc && (
                  <DesignControls
                    templateId={resolved.template.id}
                    config={resolved.config}
                    onTemplate={applyTemplate}
                    onStyle={applyStyle}
                  />
                )}
              </div>

              {/* Pane 2: form */}
              <div
                className="rs-pane-edit rs-scrollpane rs-form cr-scroll"
                id="rs-pane-edit"
                role={isCollapsed ? 'tabpanel' : 'region'}
                aria-labelledby={isCollapsed ? 'rs-tab-edit' : undefined}
                aria-label={isCollapsed ? undefined : 'Resume editor'}
                tabIndex={-1}
              >
                {docState === 'loading' && (
                  <div
                    style={{
                      ...railCard,
                      padding: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px',
                    }}
                  >
                    <Loader2
                      size={20}
                      className="animate-spin"
                      style={{ color: studioColors.accent }}
                      aria-hidden="true"
                    />
                    <span style={{ fontSize: '13.5px', color: studioColors.textMuted }}>Opening resume...</span>
                  </div>
                )}
                {docState === 'error' && selectedId && (
                  <div style={{ ...railCard, padding: '32px', textAlign: 'center' }}>
                    <p style={{ fontSize: '15px', fontWeight: 600, color: studioColors.text, margin: '0 0 14px' }}>
                      Could not open this resume.
                    </p>
                    <button
                      type="button"
                      className="rs-btn rs-primary"
                      onClick={() => void loadDocument(selectedId)}
                      style={primaryButton}
                    >
                      <RefreshCw size={16} aria-hidden="true" /> Try again
                    </button>
                  </div>
                )}
                {docState === 'idle' && selectedDoc && (
                  <>
                    {/* Both stay mounted across the Preview toggle: unmounting
                        SectionEditor would drop its debounced autosave and any
                        in-flight edit. display:none keeps timers and state. */}
                    <div style={{ display: centerView === 'edit' ? 'contents' : 'none' }}>
                      <SectionEditor
                        key={selectedDoc.id}
                        doc={selectedDoc}
                        onSectionsChange={handleSectionsChange}
                        onTemplateChange={handleTemplateChange}
                        onSaved={handleSaved}
                        onSaveStateChange={setSaveState}
                      />
                    </div>
                    {centerView === 'preview' && (
                      <div
                        className="rs-well"
                        role="region"
                        tabIndex={0}
                        aria-label="Resume preview"
                      >
                        {/* ResumePreview owns the sheet, the fit-to-width
                            scaling, and the page break guides; the shell owns
                            only the well it floats on. */}
                        <ResumePreview
                          sections={selectedDoc.sections}
                          templateId={resolved.template.id}
                          style={resolved.config}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Pane 3: AI rail. Score, review, tailoring, and the JD paste
                  live here so analysis sits beside the editor instead of
                  competing with it. */}
              <div
                className="rs-pane-insights rs-rail cr-scroll"
                id="rs-pane-insights"
                role={isCollapsed ? 'tabpanel' : 'region'}
                aria-labelledby={isCollapsed ? 'rs-tab-insights' : undefined}
                aria-label={isCollapsed ? undefined : 'AI insights and score'}
              >
                {docState === 'idle' && selectedDoc && (
                  <InsightRail
                    key={selectedDoc.id}
                    doc={selectedDoc}
                    usage={usage}
                    onFeatureUsage={handleFeatureUsage}
                    onSectionsChange={handleSectionsChange}
                    onScore={handleScore}
                  />
                )}
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
