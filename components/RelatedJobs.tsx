import Link from 'next/link';
import { MapPin, Building2, ArrowRight } from 'lucide-react';
import { slugify } from '@/lib/utils';

interface RelatedJob {
  id: string;
  title: string;
  employer: string;
  location: string;
  city?: string | null;
  state?: string | null;
  mode?: string | null;
  displaySalary?: string | null;
  normalizedMinSalary?: number | null;
  normalizedMaxSalary?: number | null;
}

interface RelatedJobsProps {
  jobs: RelatedJob[];
  title?: string;
  currentJobId?: string;
}

export default function RelatedJobs({ 
  jobs, 
  title = 'Similar Jobs You May Like',
  currentJobId 
}: RelatedJobsProps) {
  // Filter out current job if provided
  const filteredJobs = currentJobId 
    ? jobs.filter(job => job.id !== currentJobId)
    : jobs;

  if (filteredJobs.length === 0) return null;

  return (
    <section className="mt-8 pt-8 border-t border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h2>
        <Link
          href="/jobs"
          className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
        >
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredJobs.slice(0, 4).map((job) => {
          const jobSlug = slugify(job.title, job.id);
          
          return (
            <Link
              key={job.id}
              href={`/jobs/${jobSlug}`}
              className="block p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 hover:border-blue-200 group"
            >
              <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors line-clamp-1">
                {job.title}
              </h3>
              
              <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{job.employer}</span>
              </div>

              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1 text-gray-500">
                  <MapPin className="w-3 h-3" />
                  {job.location}
                </span>
                
                {job.mode && (
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                    {job.mode}
                  </span>
                )}
                
                {job.displaySalary && (
                  <span className="text-green-700 font-medium">
                    {job.displaySalary}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
