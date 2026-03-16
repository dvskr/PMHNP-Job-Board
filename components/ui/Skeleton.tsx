import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

export default function Skeleton({
  className = '',
  variant = 'text',
  animation = 'pulse',
}: SkeletonProps) {
  // Base styles
  const baseStyles = 'bg-gray-200 dark:bg-gray-700';

  // Variant styles
  const variantStyles = {
    text: 'rounded-md h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  // Animation styles
  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const combinedClasses = [
    baseStyles,
    variantStyles[variant],
    animationStyles[animation],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={combinedClasses} />;
}

// Convenience component for text lines
export function SkeletonText({
  className = '',
  animation = 'pulse',
}: Omit<SkeletonProps, 'variant'>) {
  return (
    <Skeleton
      variant="text"
      animation={animation}
      className={className}
    />
  );
}

// Convenience component for circular avatars
export function SkeletonCircle({
  className = '',
  animation = 'pulse',
}: Omit<SkeletonProps, 'variant'>) {
  return (
    <Skeleton
      variant="circular"
      animation={animation}
      className={className}
    />
  );
}

// Convenience component for rectangular boxes
export function SkeletonRect({
  className = '',
  animation = 'pulse',
}: Omit<SkeletonProps, 'variant'>) {
  return (
    <Skeleton
      variant="rectangular"
      animation={animation}
      className={className}
    />
  );
}

