import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { slugify } from '@/lib/utils';
import Badge from '@/components/ui/Badge';

interface RelatedJob {
  id: string;
  // Stored slug from Job.slug; preferred over recomputing slugify(title, id)
  // every render (a future title edit would silently change the URL).
  slug?: string | null;
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
  companyLogoUrl?: string | null;
}

interface RelatedJobsProps {
  jobs: RelatedJob[];
  title?: string;
  currentJobId?: string;
}

const clayShadow = '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';

export default function RelatedJobs({
  jobs,
  title = 'Similar Jobs You May Like',
  currentJobId
}: RelatedJobsProps) {
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredJobs.slice(0, 4).map((job) => {
          // Prefer stored slug; slugify is legacy-row fallback only.
          const jobSlug = job.slug || slugify(job.title, job.id);
          const shortLocation = (() => {
            if (!job.location) return 'Remote';
            const first = job.location.split(';')[0].split(',').slice(0, 2).join(',').trim();
            return first.length > 30 ? first.slice(0, 28) + '…' : first;
          })();

          return (
            <Link
              key={job.id}
              href={`/jobs/${jobSlug}`}
              className="rj-card block"
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  padding: '16px 20px',
                  backgroundColor: '#F7FBF8',
                  borderRadius: '20px',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: clayShadow,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {/* Company Avatar */}
                <div style={{ flexShrink: 0 }}>
                  {job.companyLogoUrl ? (
                    <img
                      src={job.companyLogoUrl}
                      alt={`${job.employer} logo`}
                      width={44}
                      height={44}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: '44px', height: '44px', borderRadius: '50%',
                        objectFit: 'contain', border: '1px solid var(--border-color)',
                        background: 'var(--bg-tertiary)',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: `hsl(${(job.employer || '').charCodeAt(0) * 7 % 360}, 40%, 50%)`,
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '17px', fontWeight: 700,
                    }}>
                      {(job.employer || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    fontSize: '16px', fontWeight: 700,
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    color: 'var(--text-primary)',
                    margin: '0 0 3px', lineHeight: 1.3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {job.title}
                  </h3>
                  <p style={{
                    fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)',
                    margin: '0 0 8px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {job.employer}
                  </p>

                  {/* Badges Row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                    <Badge variant="outline" size="sm">
                      <MapPin size={13} style={{ color: 'var(--color-primary)' }} />
                      {shortLocation}
                    </Badge>
                    {job.jobType && <Badge variant="outline" size="sm">{job.jobType}</Badge>}
                    {job.mode && <Badge variant="outline" size="sm">{job.mode}</Badge>}
                    {job.displaySalary && (
                      <Badge variant="salary" size="sm">
                        {job.displaySalary}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <style>{`
        .rj-card:hover > div {
          border-color: var(--color-primary) !important;
          transform: translateY(-3px);
          box-shadow: 10px 10px 24px rgba(0,0,0,0.1), -5px -5px 14px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02) !important;
        }
      `}</style>
    </section>
  );
}
