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

export default async function PopularCategories() {
  // Fetch categories server-side
  let categories: { label: string; count: number; href: string }[] = [];

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/jobs/categories`, {
      cache: 'no-store', // Always get fresh data
      // Alternative: next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (response.ok) {
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

      categories = chips;
    }
  } catch (error) {
    console.error('Error fetching categories:', error);
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

