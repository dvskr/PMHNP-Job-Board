'use client';

import { useState, useEffect } from 'react';
import CategoryChips from '@/components/CategoryChips';

interface CategoryCounts {
  byMode: Record<string, number>;
  byJobType: Record<string, number>;
  byState: Record<string, number>;
  special: {
    highPaying: number;
    newThisWeek: number;
  };
}

export default function PopularCategories() {
  const [categories, setCategories] = useState<{ label: string; count: number; href: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/jobs/categories');
        if (!response.ok) {
          throw new Error('Failed to fetch categories');
        }
        const data: CategoryCounts = await response.json();

        // Build category chips
        const chips: { label: string; count: number; href: string }[] = [];

        // Remote jobs
        if (data.byMode['Remote']) {
          chips.push({
            label: 'Remote',
            count: data.byMode['Remote'],
            href: '/jobs?mode=Remote',
          });
        }

        // Full-Time jobs
        if (data.byJobType['Full-Time']) {
          chips.push({
            label: 'Full-Time',
            count: data.byJobType['Full-Time'],
            href: '/jobs?jobType=Full-Time',
          });
        }

        // High Paying jobs
        if (data.special.highPaying > 0) {
          chips.push({
            label: 'High Paying',
            count: data.special.highPaying,
            href: '/jobs?minSalary=150000',
          });
        }

        // New This Week
        if (data.special.newThisWeek > 0) {
          chips.push({
            label: 'New This Week',
            count: data.special.newThisWeek,
            href: '/jobs?posted=week',
          });
        }

        // Top 3 states
        const topStates = Object.entries(data.byState)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        for (const [state, count] of topStates) {
          chips.push({
            label: state,
            count,
            href: `/jobs?location=${encodeURIComponent(state)}`,
          });
        }

        setCategories(chips);
      } catch (error) {
        console.error('Error fetching categories:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCategories();
  }, []);

  if (loading) {
    return (
      <section className="py-12 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Popular Categories
          </h2>
          <div className="flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-10 w-28 bg-gray-100 rounded-full animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <section className="py-12 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Popular Categories
        </h2>
        <div className="flex justify-center">
          <CategoryChips categories={categories} layout="wrap" />
        </div>
      </div>
    </section>
  );
}

