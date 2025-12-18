import React from 'react';
import Skeleton from '@/components/ui/Skeleton';

export default function StatsSkeleton() {
  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-center">
          {/* Stat Box 1 */}
          <div className="flex flex-col items-center">
            <Skeleton className="h-10 w-24 mb-2" animation="pulse" />
            <Skeleton className="h-5 w-32" animation="pulse" />
          </div>

          {/* Stat Box 2 */}
          <div className="flex flex-col items-center">
            <Skeleton className="h-10 w-24 mb-2" animation="pulse" />
            <Skeleton className="h-5 w-36" animation="pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}

