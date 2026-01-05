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
    default: 'bg-gray-100 text-black',
    primary: 'bg-primary-50 text-black',
    success: 'bg-green-100 text-black',
    warning: 'bg-amber-100 text-black',
    danger: 'bg-red-100 text-black',
    featured: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold',
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

