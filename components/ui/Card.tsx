import React from 'react';

interface CardProps {
  variant?: 'default' | 'elevated' | 'bordered' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  children,
  className = '',
  onClick,
}) => {
  // Base styles for all cards
  const baseStyles = 'bg-white rounded-xl';

  // Variant styles
  const variantStyles = {
    default: 'shadow-card',
    elevated: 'shadow-lg',
    bordered: 'border border-gray-200 shadow-none',
    interactive: 'shadow-card hover:shadow-card-hover transition-shadow duration-200 cursor-pointer',
  };

  // Padding styles
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  // Combine all styles
  const cardClasses = [
    baseStyles,
    variantStyles[variant],
    paddingStyles[padding],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // If interactive and has onClick, make it a button-like div
  if (variant === 'interactive' && onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={cardClasses}
      >
        {children}
      </div>
    );
  }

  return <div className={cardClasses}>{children}</div>;
};

export default Card;

