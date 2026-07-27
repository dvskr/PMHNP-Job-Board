/**
 * Resume Studio design tokens, taken from the CareResume mockup
 * (studio mockup/CareResume.dc.html).
 *
 * This is a deliberately separate palette from the marketing site's clay
 * system: the studio is a dense working tool, so it uses a warmer paper
 * ground, a deeper teal, and tighter surfaces. Import these instead of
 * hardcoding hex values in studio components.
 */

export const studioColors = {
  /** Page ground behind the panes. */
  canvas: '#efece4',
  /** Raised surfaces (panes, cards). */
  surface: '#fcfbf7',
  surfaceAlt: '#fbfaf6',
  /** Recessed wells (inputs, empty states). */
  well: '#f0ece2',
  wellAlt: '#eee9dd',
  /** Hairlines. */
  border: '#e2ddd1',
  borderSoft: '#ebe6da',
  borderStrong: '#e8e3d8',

  /** Primary action + brand. */
  accent: '#0d6b62',
  accentDark: '#0a4f49',
  accentWash: '#e4f0ec',

  /** Text ramp, darkest to lightest. */
  ink: '#152623',
  text: '#182b28',
  textStrong: '#3a453f',
  textBody: '#4a5852',
  textSoft: '#5a655f',
  textMuted: '#61706b',
  textFaint: '#8a938e',

  /** Semantic. */
  success: '#1f8a5b',
  successWash: '#eef6f0',
  warn: '#8a5416',
  warnWash: '#f8ecd8',
  danger: '#b4514a',
  info: '#4a7a8c',
} as const;

export const studioRadii = {
  sm: '6px',
  md: '9px',
  lg: '12px',
  xl: '16px',
  pill: '99px',
} as const;

/** Flat, paper-like elevation. The studio deliberately avoids the marketing
 *  site's heavy neumorphic shadow: at editor density it reads as noise. */
export const studioShadow = {
  pane: '0 1px 2px rgba(21,38,35,.04), 0 8px 24px rgba(21,38,35,.05)',
  raised: '0 2px 6px rgba(21,38,35,.07), 0 12px 32px rgba(21,38,35,.07)',
  paper: '0 1px 3px rgba(21,38,35,.08), 0 18px 44px rgba(21,38,35,.10)',
} as const;

/** UI chrome font (not the resume body font, which is user-selectable). */
export const studioFontStack =
  "'IBM Plex Sans', system-ui, -apple-system, Segoe UI, sans-serif";
/** Numerals in scores, counters, and meta rows. */
export const studioMonoStack = "'IBM Plex Mono', ui-monospace, monospace";

export const studioPane: React.CSSProperties = {
  background: studioColors.surface,
  border: `1px solid ${studioColors.border}`,
  borderRadius: studioRadii.lg,
  boxShadow: studioShadow.pane,
};
