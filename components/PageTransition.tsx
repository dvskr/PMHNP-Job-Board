'use client';

import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageTransition({
  children,
  className = '',
}: PageTransitionProps) {
  return (
    <div className={`animate-fade-in-up ${className}`.trim()}>
      {children}
    </div>
  );
}

