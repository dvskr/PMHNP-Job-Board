'use client';

import React from 'react';
import AnimatedContainer from '@/components/ui/AnimatedContainer';

interface StaggeredListProps {
  children: React.ReactNode;
  staggerDelay?: number;
  animation?: 'fade-in-up' | 'fade-in' | 'slide-in-right';
  className?: string;
}

export default function StaggeredList({
  children,
  staggerDelay = 50,
  animation = 'fade-in-up',
  className = '',
}: StaggeredListProps) {
  // Convert children to array
  const childrenArray = React.Children.toArray(children);

  return (
    <div className={className}>
      {childrenArray.map((child, index) => (
        <AnimatedContainer
          key={index}
          animation={animation}
          delay={index * staggerDelay}
        >
          {child}
        </AnimatedContainer>
      ))}
    </div>
  );
}

