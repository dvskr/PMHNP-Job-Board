import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'primary' | 'outline' | 'salary' | 'secondary' | 'success' | 'warning' | 'danger' | 'featured';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

/*
 * Badge — Claymorphic pill design.
 * Every badge is a visibly puffy clay pill with dramatic shadows.
 */
const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'sm',
  children,
  className = '',
}) => {
  const pad = size === 'sm' ? '5px 14px' : '7px 16px';
  const font = size === 'sm' ? '12px' : '13px';

  // ── Clay pill base ──
  const clayBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    whiteSpace: 'nowrap',
    borderRadius: '20px',
    padding: pad,
    fontSize: font,
    transition: 'all 0.15s ease',
    border: '1px solid rgba(255,255,255,0.5)',
  };

  // ── Clay shadow formula — visible and puffy ──
  const clayShadow = (tint?: string) => {
    const outer = tint
      ? `4px 4px 10px ${tint}`
      : '4px 4px 10px rgba(0,0,0,0.06)';
    return `${outer}, -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)`;
  };

  const variants: Record<string, React.CSSProperties> = {
    outline: {
      fontWeight: 500,
      backgroundColor: '#EDF2EE',
      color: '#374151',
      boxShadow: clayShadow(),
    },
    salary: {
      fontWeight: 700,
      fontSize: size === 'sm' ? '13px' : '14px',
      backgroundColor: '#B2F5EA',
      color: '#0F766E',
      boxShadow: clayShadow('rgba(13,148,136,0.12)'),
    },
    primary: {
      fontWeight: 600,
      backgroundColor: '#E0E7E2',
      color: '#1F2937',
      boxShadow: clayShadow(),
    },
    featured: {
      fontWeight: 700,
      backgroundColor: '#FDE68A',
      color: '#78350F',
      boxShadow: clayShadow('rgba(245,158,11,0.15)'),
    },
    success: {
      fontWeight: 600,
      backgroundColor: '#A7F3D0',
      color: '#065F46',
      boxShadow: clayShadow('rgba(16,185,129,0.12)'),
    },
    warning: {
      fontWeight: 600,
      backgroundColor: '#FDE68A',
      color: '#78350F',
      boxShadow: clayShadow('rgba(245,158,11,0.12)'),
    },
    danger: {
      fontWeight: 600,
      backgroundColor: '#FECACA',
      color: '#991B1B',
      boxShadow: clayShadow('rgba(239,68,68,0.12)'),
    },
    default: {
      fontWeight: 500,
      backgroundColor: '#E0E7E2',
      color: '#4B5563',
      boxShadow: clayShadow(),
    },
    secondary: {
      fontWeight: 500,
      backgroundColor: '#E0E7E2',
      color: '#4B5563',
      boxShadow: clayShadow(),
    },
  };

  const v = variants[variant] || variants.default;

  return (
    <span className={className} style={{ ...clayBase, ...v }}>
      {children}
    </span>
  );
};

export default Badge;
