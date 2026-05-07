/**
 * Clay-mint design tokens shared across every settings section.
 *
 * The /settings page header, the SettingsTabs nav, and the per-section
 * cards previously used three different visual languages — neutral
 * `var(--bg-secondary)` (warm beige #F3F2EF), hardcoded clay mint
 * (#F7FBF8 with mint-tinted shadows), and assorted ad-hoc inputs.
 * Threading this module through every section component is what makes
 * "clay" a system instead of a one-off in app/settings/page.tsx.
 *
 * Naming follows the pattern in app/settings/page.tsx so the existing
 * cardStyle / inputStyle / labelStyle / btnPrimary / btnOutline
 * destructures keep working when callers swap to the clay versions.
 */

import type { CSSProperties } from 'react';

/* ─────────────────────────── Color tokens ─────────────────────────── */

export const clayPalette = {
    /** Top-level card background — warm mint cream. */
    surface: '#F7FBF8',
    /** Recessed/inset surface — slightly darker mint for depth. */
    surfaceRecessed: '#EDF2EE',
    /** Pure-white input/select fill so the inset shadow reads. */
    inputFill: '#FFFFFF',

    /** Subtle mint-tinted border. Pairs with the inset shadow on every
     *  field/card so edges read in light backgrounds. */
    border: 'rgba(213, 232, 224, 0.6)',
    borderStrong: 'rgba(213, 232, 224, 0.9)',
    borderHover: 'rgba(45, 212, 191, 0.5)',

    /** Deep mint-tinted ink for headings and primary text. */
    textPrimary: '#1A2E35',
    /** Body text on cards. */
    textSecondary: '#4A5E6A',
    /** Captions / placeholders. */
    textMuted: '#6B7F8A',

    /** Brand accents. */
    accent: '#0D9488',          // teal — primary CTA
    accentLight: '#2DD4BF',     // bright teal — highlights, active state
    danger: '#B91C1C',
    dangerLight: '#EF4444',
    warning: '#F59E0B',
    info: '#818CF8',
    success: '#22C55E',
    purple: '#8B5CF6',
} as const;

/* ─────────────────────────── Card surfaces ─────────────────────────── */

/** Top-level card — every section component wraps its content in this. */
export const clayCard: CSSProperties = {
    background: clayPalette.surface,
    border: `1px solid ${clayPalette.border}`,
    borderRadius: '20px',
    padding: '28px',
    boxShadow:
        '6px 6px 16px rgba(0,0,0,0.05),' +
        ' -3px -3px 10px rgba(255,255,255,0.8),' +
        ' inset 2px 2px 4px rgba(255,255,255,0.6),' +
        ' inset -1px -1px 2px rgba(0,0,0,0.01)',
};

/** Inner row card — used inside a list (one license, one work entry). */
export const clayInnerCard: CSSProperties = {
    background: clayPalette.surfaceRecessed,
    border: `1px solid ${clayPalette.border}`,
    borderRadius: '14px',
    padding: '14px 18px',
    boxShadow:
        'inset 2px 2px 5px rgba(0,0,0,0.04),' +
        ' inset -1px -1px 3px rgba(255,255,255,0.6)',
};

/** Inline form panel — the Add/Edit form rendered under the active row. */
export const clayFormPanel: CSSProperties = {
    background: clayPalette.surfaceRecessed,
    border: `1px solid ${clayPalette.border}`,
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow:
        'inset 2px 2px 6px rgba(0,0,0,0.04),' +
        ' inset -1px -1px 3px rgba(255,255,255,0.6)',
};

/* ─────────────────────────── Typography ─────────────────────────── */

/** Section heading inside a clay card. */
export const clayTitle: CSSProperties = {
    fontSize: '18px',
    fontWeight: 800,
    fontFamily: 'var(--font-lora), Georgia, serif',
    color: clayPalette.textPrimary,
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
};

/** Subheading inside a form panel (e.g. "Add Reference"). */
export const claySubTitle: CSSProperties = {
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: 'var(--font-lora), Georgia, serif',
    color: clayPalette.textPrimary,
    margin: 0,
};

/* ─────────────────────────── Form fields ─────────────────────────── */

export const clayInput: CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '12px',
    border: `1px solid ${clayPalette.border}`,
    background: clayPalette.inputFill,
    color: clayPalette.textPrimary,
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow:
        'inset 2px 2px 5px rgba(0,0,0,0.04),' +
        ' inset -1px -1px 3px rgba(255,255,255,0.6)',
    boxSizing: 'border-box',
};

export const clayLabel: CSSProperties = {
    color: clayPalette.textSecondary,
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
    display: 'block',
};

/* ─────────────────────────── Buttons ─────────────────────────── */

export const clayBtnPrimary: CSSProperties = {
    padding: '10px 24px',
    borderRadius: '12px',
    background: clayPalette.accent,
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.3)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow:
        '4px 4px 10px rgba(13,148,136,0.20),' +
        ' -2px -2px 6px rgba(255,255,255,0.3),' +
        ' inset 2px 2px 4px rgba(255,255,255,0.2)',
    transition: 'all 0.2s ease',
};

export const clayBtnOutline: CSSProperties = {
    padding: '8px 16px',
    borderRadius: '10px',
    background: clayPalette.surface,
    color: clayPalette.textSecondary,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${clayPalette.borderStrong}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    boxShadow:
        '2px 2px 6px rgba(0,0,0,0.04),' +
        ' -1px -1px 3px rgba(255,255,255,0.6),' +
        ' inset 1px 1px 2px rgba(255,255,255,0.5)',
    transition: 'all 0.2s ease',
};

export const clayBtnDanger: CSSProperties = {
    padding: '8px 14px',
    borderRadius: '10px',
    background: 'rgba(239, 68, 68, 0.06)',
    color: clayPalette.danger,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease',
};

/** Compact icon-only / table-row variant of the outline button. */
export const clayBtnOutlineSmall: CSSProperties = {
    ...clayBtnOutline,
    padding: '6px 10px',
    fontSize: '12px',
    borderRadius: '8px',
};
