interface Stats {
  totalJobs: number;
  totalSubscribers: number;
  totalCompanies: number;
}

export default async function StatsSection() {
  // Fetch stats server-side
  let stats: Stats | null = null;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/stats`, {
      cache: 'no-store', // Always get fresh data
      // Alternative: next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (response.ok) {
      stats = await response.json();
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
  }

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  return (
    <section className="py-16 px-4 bg-white" style={{ minHeight: '208px' }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-center">
          {/* Total Jobs */}
          <div>
            <div className="text-4xl font-bold text-blue-600 mb-2" style={{ minHeight: '48px' }}>
              {stats ? formatNumber(stats.totalJobs) : '0'}+
            </div>
            <div className="text-gray-600">Active Jobs</div>
          </div>

          {/* Total Companies */}
          <div>
            <div className="text-4xl font-bold text-blue-600 mb-2" style={{ minHeight: '48px' }}>
              {stats ? formatNumber(stats.totalCompanies) : '0'}+
            </div>
            <div className="text-gray-600">Companies Hiring</div>
          </div>
        </div>
      </div>
    </section>
  );
}

