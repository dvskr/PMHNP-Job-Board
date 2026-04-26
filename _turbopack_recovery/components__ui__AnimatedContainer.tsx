'use client';

import React from 'react';

interface AnimatedContainerProps {
  animation: 'fade-in' | 'fade-in-up' | 'fade-in-down' | 'slide-in-right' | 'slide-in-left' | 'scale-in';
  delay?: number;
  duration?: number;
  className?: string;
  children: React.ReactNode;
}

export default function AnimatedContainer({
  animation,
  delay = 0,
  duration = 300,
  className = '',
  children,
}: AnimatedContainerProps) {
  // Map animation names to Tailwind classes
  const animationClasses: Record<AnimatedContainerProps['animation'], string> = {
    'fade-in': 'animate-fade-in',
    'fade-in-up': 'animate-fade-in-up',
    'fade-in-down': 'animate-fade-in-down',
    'slide-in-right': 'animate-slide-in-right',
    'slide-in-left': 'animate-slide-in-left',
    'scale-in': 'animate-scale-in',
  };

  const animationClass = animationClasses[animation];

  const style: React.CSSProperties = {
    animationDelay: delay > 0 ? `${delay}ms` : undefined,
    animationDuration: duration > 0 ? `${duration}ms` : undefined,
  };

  return (
    <div className={`${animationClass} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

