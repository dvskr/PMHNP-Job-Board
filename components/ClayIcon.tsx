'use client';

import React from 'react';

/**
 * ClayIcon — wraps any icon in a puffy claymorphic pebble container.
 * Use this EVERYWHERE you need an icon in the app.
 */
interface ClayIconProps {
  children: React.ReactNode;
  /** Background color of the pebble */
  bg?: string;
  /** Size of the pebble in px */
  size?: number;
  /** Icon color */
  color?: string;
  /** Additional className */
  className?: string;
  /** Custom style overrides */
  style?: React.CSSProperties;
}

export default function ClayIcon({
  children,
  bg = '#E8F5F0',
  size = 40,
  color = '#0D9488',
  className = '',
  style = {},
}: ClayIconProps) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.35),
        backgroundColor: bg,
        color,
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: `
          ${Math.round(size * 0.12)}px ${Math.round(size * 0.12)}px ${Math.round(size * 0.3)}px rgba(0,0,0,0.10),
          ${Math.round(size * -0.05)}px ${Math.round(size * -0.05)}px ${Math.round(size * 0.15)}px rgba(255,255,255,0.9),
          inset ${Math.round(size * 0.06)}px ${Math.round(size * 0.06)}px ${Math.round(size * 0.12)}px rgba(255,255,255,0.7),
          inset ${Math.round(size * -0.04)}px ${Math.round(size * -0.04)}px ${Math.round(size * 0.08)}px rgba(0,0,0,0.04)
        `,
        flexShrink: 0,
        transition: 'all 0.25s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Inline clay icon style generator — for places that can't use a component.
 */
export function clayIconStyle(opts?: { bg?: string; size?: number; color?: string }): React.CSSProperties {
  const bg = opts?.bg ?? '#E8F5F0';
  const size = opts?.size ?? 40;
  const color = opts?.color ?? '#0D9488';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.35),
    backgroundColor: bg,
    color,
    border: '1px solid rgba(255,255,255,0.6)',
    boxShadow: `
      ${Math.round(size * 0.12)}px ${Math.round(size * 0.12)}px ${Math.round(size * 0.3)}px rgba(0,0,0,0.10),
      ${Math.round(size * -0.05)}px ${Math.round(size * -0.05)}px ${Math.round(size * 0.15)}px rgba(255,255,255,0.9),
      inset ${Math.round(size * 0.06)}px ${Math.round(size * 0.06)}px ${Math.round(size * 0.12)}px rgba(255,255,255,0.7),
      inset ${Math.round(size * -0.04)}px ${Math.round(size * -0.04)}px ${Math.round(size * 0.08)}px rgba(0,0,0,0.04)
    `,
    flexShrink: 0,
  };
}
