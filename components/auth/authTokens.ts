/**
 * Shared UX-first form tokens for all auth pages.
 * 
 * Design rationale:
 *  - Inputs: White bg + visible border = maximum readability & contrast (WCAG AA)
 *  - Labels: 14px, dark color, 600 weight = easy to scan
 *  - Focus: Teal ring = clear active-field indicator
 *  - Clay aesthetic reserved for card wrapper, buttons, toggles — not inputs
 */
import React from 'react';

/* ─── Input ─── */
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1.5px solid #D1DBE0',
  background: '#FFFFFF',
  fontSize: '14px',
  color: '#1A2E35',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
};

export const inputWithRightIcon: React.CSSProperties = {
  ...inputStyle,
  paddingRight: '44px',
};

export const inputWithLeftIcon: React.CSSProperties = {
  ...inputStyle,
  paddingLeft: '42px',
};

export const inputWithBothIcons: React.CSSProperties = {
  ...inputStyle,
  paddingLeft: '42px',
  paddingRight: '44px',
};

/* ─── Label ─── */
export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 600,
  color: '#1A2E35',
  marginBottom: '6px',
};

/* ─── Helper text ─── */
export const helperStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6B7F8A',
  marginTop: '6px',
};

/* ─── Left icon ─── */
export const leftIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '14px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#94A3B0',
  pointerEvents: 'none',
};

/* ─── Toggle eye button ─── */
export const eyeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#94A3B0',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
};

/* ─── Error banner ─── */
export const errorBannerStyle: React.CSSProperties = {
  background: '#FEF2F2',
  border: '1.5px solid #FECACA',
  borderRadius: '12px',
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'start',
  gap: '10px',
};

/* ─── CTA button (gradient clay) ─── */
export const ctaButtonStyle = (loading: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '13px 24px',
  borderRadius: '14px',
  border: 'none',
  background: 'linear-gradient(145deg, #0D9488, #0F766E)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '15px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.6 : 1,
  boxShadow: '0 4px 14px rgba(13,148,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
  transition: 'all 0.15s',
});

/* ─── Pill toggle (clay) ─── */
export const toggleWrapperStyle: React.CSSProperties = {
  background: '#F0F5F3',
  border: '1px solid #E0EDE6',
  borderRadius: '14px',
  padding: '4px',
  display: 'flex',
};

export const toggleActiveStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px',
  fontSize: '14px',
  fontWeight: 600,
  borderRadius: '11px',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s',
  background: '#FFFFFF',
  color: '#0D9488',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
};

export const toggleInactiveStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px',
  fontSize: '14px',
  fontWeight: 500,
  borderRadius: '11px',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s',
  background: 'transparent',
  color: '#94A3B0',
  boxShadow: 'none',
};

/* ─── Opt-in card ─── */
export const optInCardStyle: React.CSSProperties = {
  background: '#F0F8F5',
  borderWidth: '1.5px',
  borderStyle: 'solid',
  borderColor: '#D1E7DD',
  borderRadius: '12px',
  padding: '14px 16px',
};

/* ─── Divider (OR line) ─── */
export const dividerLineStyle: React.CSSProperties = {
  borderTop: '1.5px solid #E0EDE6',
};

export const dividerTextStyle: React.CSSProperties = {
  background: '#FFFFFF',
  color: '#94A3B0',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  padding: '0 12px',
};

/* ─── Google button (raised but clear) ─── */
export const googleBtnStyle: React.CSSProperties = {
  background: '#FFFFFF',
  color: '#1A2E35',
  border: '1.5px solid #D1DBE0',
  borderRadius: '12px',
  padding: '12px 16px',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

/* ─── Link text ─── */
export const linkStyle: React.CSSProperties = {
  fontWeight: 600,
  color: '#0D9488',
  textDecoration: 'none',
};

export const secondaryTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#6B7F8A',
  margin: 0,
  textAlign: 'center',
};
