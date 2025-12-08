import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'featured';
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
  // Base styles for all badges
  const baseStyles = 'rounded-full font-medium inline-flex items-center';

  // Variant styles
  const variantStyles = {
    default: 'bg-gray-100 text-gray-700',
    primary: 'bg-primary-100 text-primary-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    featured: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold',
  };

  // Size styles
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  // Combine all styles
  const badgeClasses = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={badgeClasses}>{children}</span>;
};

export default Badge;

