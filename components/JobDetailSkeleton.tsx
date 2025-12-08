import React from 'react';
import Skeleton from '@/components/ui/Skeleton';

export default function JobDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <div className="bg-white shadow-md rounded-lg p-6 md:p-8">
        {/* Title */}
        <Skeleton className="h-10 w-2/3 mb-2" animation="pulse" />
        
        {/* Company */}
        <Skeleton className="h-6 w-1/3 mb-4" animation="pulse" />

        {/* Metadata Row */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" animation="pulse" />
            <Skeleton className="h-5 w-32" animation="pulse" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" animation="pulse" />
            <Skeleton className="h-5 w-24" animation="pulse" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" animation="pulse" />
            <Skeleton className="h-5 w-20" animation="pulse" />
          </div>
        </div>

        {/* Salary */}
        <div className="mt-4">
          <Skeleton className="h-8 w-1/4" animation="pulse" />
        </div>

        {/* Badges Row */}
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-7 w-24 rounded-full" animation="pulse" />
          <Skeleton className="h-7 w-32 rounded-full" animation="pulse" />
        </div>
      </div>

      {/* Description Section */}
      <div className="bg-white shadow-md rounded-lg p-6 md:p-8 mt-6">
        {/* Section Title */}
        <Skeleton className="h-8 w-48 mb-4" animation="pulse" />
        
        {/* Description Lines - simulating paragraph text */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" animation="pulse" />
          <Skeleton className="h-4 w-full" animation="pulse" />
          <Skeleton className="h-4 w-[95%]" animation="pulse" />
          <Skeleton className="h-4 w-full" animation="pulse" />
          <Skeleton className="h-4 w-[80%]" animation="pulse" />
          
          {/* Paragraph break */}
          <div className="py-2" />
          
          <Skeleton className="h-4 w-full" animation="pulse" />
          <Skeleton className="h-4 w-full" animation="pulse" />
          <Skeleton className="h-4 w-[90%]" animation="pulse" />
          <Skeleton className="h-4 w-full" animation="pulse" />
          <Skeleton className="h-4 w-[75%]" animation="pulse" />
          
          {/* Paragraph break */}
          <div className="py-2" />
          
          <Skeleton className="h-4 w-full" animation="pulse" />
          <Skeleton className="h-4 w-[85%]" animation="pulse" />
        </div>
      </div>

      {/* Apply Section */}
      <div className="bg-gray-50 rounded-lg p-6 mt-8 shadow-md">
        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-12 w-40 rounded-lg" animation="pulse" />
          <Skeleton className="h-12 w-32 rounded-lg" animation="pulse" />
        </div>

        {/* Share Section */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
          <Skeleton className="h-4 w-24" animation="pulse" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded" animation="pulse" />
            <Skeleton className="h-8 w-8 rounded" animation="pulse" />
            <Skeleton className="h-8 w-8 rounded" animation="pulse" />
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-8">
        <Skeleton className="h-4 w-32" animation="pulse" />
      </div>
    </div>
  );
}

