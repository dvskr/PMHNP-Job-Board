import Link from 'next/link';
import { MapPin, Building2, ArrowRight } from 'lucide-react';
import { slugify } from '@/lib/utils';
import Badge from '@/components/ui/Badge';

interface RelatedJob {
  id: string;
  title: string;
  employer: string;
  location: string;
  city?: string | null;
  state?: string | null;
  mode?: string | null;
  jobType?: string | null;
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
    <section style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: 'clamp(18px, 3vw, 22px)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
        <Link
          href="/jobs"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)',
            textDecoration: 'none',
          }}
        >
          View all
          <ArrowRight style={{ width: '14px', height: '14px' }} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredJobs.slice(0, 4).map((job) => {
          const jobSlug = slugify(job.title, job.id);

          return (
            <Link
              key={job.id}
              href={`/jobs/${jobSlug}`}
              className="rj-card"
              style={{
                display: 'block', padding: '16px', borderRadius: '12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
            >
              <h3 style={{
                fontWeight: 600, fontSize: '15px',
                color: 'var(--text-primary)', margin: '0 0 4px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {job.title}
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Building2 style={{ width: '14px', height: '14px', flexShrink: 0, color: 'var(--text-tertiary)' }} />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.employer}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <MapPin style={{ width: '13px', height: '13px', color: 'var(--color-primary)' }} />
                  {job.location}
                </span>

                {job.jobType && <Badge variant="primary" size="sm">{job.jobType}</Badge>}
                {job.mode && <Badge variant="primary" size="sm">{job.mode}</Badge>}

                {job.displaySalary && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--salary-color, #1d4ed8)' }}>
                    {job.displaySalary}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <style>{`
        .rj-card:hover {
          border-color: var(--color-primary) !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px var(--shadow-color, rgba(0,0,0,0.08));
        }
      `}</style>
    </section>
  );
}
