import React from 'react';
import Skeleton from '@/components/ui/Skeleton';

export default function JobCardSkeleton() {
  return (
    <div className="rounded-xl flex flex-col gap-3 w-full p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
      {/* Title area */}
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-6 w-3/4" animation="pulse" />
      </div>

      {/* Company Name */}
      <Skeleton className="h-5 w-1/2" animation="pulse" />

      {/* Location with icon space */}
      <div className="flex items-center gap-1">
        <Skeleton className="h-4 w-4 rounded" animation="pulse" />
        <Skeleton className="h-4 w-32" animation="pulse" />
      </div>

      {/* Job Type and Mode Badges */}
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" animation="pulse" />
        <Skeleton className="h-6 w-20 rounded-full" animation="pulse" />
      </div>

      {/* Salary */}
      <Skeleton className="h-5 w-1/3" animation="pulse" />

      {/* Posted date (freshness) */}
      <Skeleton className="h-3 w-24" animation="pulse" />
    </div>
  );
}

