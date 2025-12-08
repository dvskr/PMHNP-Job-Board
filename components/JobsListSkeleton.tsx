import React from 'react';
import JobCardSkeleton from '@/components/JobCardSkeleton';

interface JobsListSkeletonProps {
  count?: number;
}

export default function JobsListSkeleton({ count = 6 }: JobsListSkeletonProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <JobCardSkeleton key={index} />
      ))}
    </div>
  );
}

