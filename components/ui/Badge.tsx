import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'featured';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'sm',
  children,
  className = '',
}) => {
  // Primary variant uses inline styles for reliable rendering across themes
  if (variant === 'primary') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          whiteSpace: 'nowrap', fontWeight: 600, borderRadius: '6px',
          padding: size === 'sm' ? '3px 10px' : '5px 12px',
          fontSize: size === 'sm' ? '11px' : '13px',
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-color)',
        }}
      >
        {children}
      </span>
    );
  }

  // Base styles for all other badges
  const baseStyles = 'rounded-md font-medium inline-flex items-center gap-1 whitespace-nowrap';

  const variantStyles = {
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
    secondary: 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    danger: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    featured: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  const badgeClasses = [
    baseStyles,
    variantStyles[variant as keyof typeof variantStyles],
    sizeStyles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={badgeClasses}>{children}</span>;
};

export default Badge;
