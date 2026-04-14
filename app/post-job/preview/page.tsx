'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Briefcase, Monitor, ExternalLink, DollarSign, ChevronLeft, ChevronRight, Loader2, Check } from 'lucide-react';
import { formatSalary } from '@/lib/utils';
import { sanitizeHtmlContent } from '@/lib/sanitize';
import { config } from '@/lib/config';

interface JobFormData {
  title: string;
  companyName: string;
  companyWebsite?: string;
  companyDescription?: string;
  location: string;
  mode?: string;
  jobType?: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: string;
  applyUrl?: string;
  applyOnPlatform?: boolean;
  contactEmail: string;
  pricingTier: 'starter' | 'growth' | 'premium';
  benefits?: string[];
  setting?: string;
  population?: string;
  companyLogoUrl?: string;
  screeningQuestions?: { text: string; type: string; options?: string[]; required?: boolean; knockout?: boolean; knockoutAnswer?: string }[];
}

/* ═══ Clay Tokens ═══ */
const cardBase: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '14px 28px', borderRadius: '14px',
  fontSize: '14px', fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
  cursor: 'pointer', transition: 'all 0.2s ease',
};

const clayPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '5px 12px', borderRadius: '10px',
  fontSize: '12px', fontWeight: 500,
  boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.4)',
};

export default function PreviewPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<JobFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('jobFormData');
    if (!stored) { router.push('/post-job'); return; }
    try {
      const data = JSON.parse(stored) as JobFormData;
      try {
        const storedQuestions = localStorage.getItem('jobScreeningQuestions');
        if (storedQuestions) data.screeningQuestions = JSON.parse(storedQuestions);
      } catch { /* ignore */ }
      setFormData(data);
    } catch (error) {
      console.error('Error parsing form data:', error);
      router.push('/post-job');
      return;
    }
    setLoading(false);
  }, [router]);

  const handleBack = () => { router.push('/post-job'); };

  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (config.isPaidPostingEnabled) {
        router.push('/post-job/checkout');
      } else {
        if (!formData) return;
        const response = await fetch('/api/jobs/post-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            employer: formData.companyName,
            location: formData.location,
            mode: formData.mode,
            jobType: formData.jobType,
            description: formData.description,
            applyLink: formData.applyOnPlatform ? null : formData.applyUrl,
            applyOnPlatform: formData.applyOnPlatform || false,
            contactEmail: formData.contactEmail,
            minSalary: formData.salaryMin,
            maxSalary: formData.salaryMax,
            salaryPeriod: formData.salaryPeriod || 'annual',
            companyWebsite: formData.companyWebsite,
            pricing: formData.pricingTier,
            benefits: formData.benefits,
            setting: formData.setting,
            population: formData.population,
            companyLogoUrl: formData.companyLogoUrl,
            screeningQuestions: formData.screeningQuestions || [],
          }),
        });
        const result = await response.json();
        if (result.success) {
          localStorage.removeItem('jobFormData');
          localStorage.removeItem('jobScreeningQuestions');
          router.push('/success?free=true');
        } else {
          setError(result.error || 'Failed to post job');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || !formData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid #E5E7EB', borderTopColor: '#0D9488',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const salary = formatSalary(formData.salaryMin, formData.salaryMax, formData.salaryPeriod);
  const effectiveTier = config.isPaidPostingEnabled ? formData.pricingTier : 'growth';
  const isFeatured = config.isFeaturedTier(effectiveTier as 'starter' | 'growth' | 'premium');
  const price = config.isPaidPostingEnabled ? config.getPostingPrice(formData.pricingTier) : 0;
  const priceLabel = config.formatPrice(price);

  return (
    <div style={{ background: '#F5F6F8', minHeight: '100vh', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
            Preview Your Job Post
          </h1>
          <p style={{ fontSize: '14px', color: '#8A9BA6', margin: 0 }}>Review how your job will appear to candidates</p>
        </div>

        {/* Section 1: Card Preview */}
        <div style={{ ...cardBase, padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>How it appears in listings</h2>
            <span style={{ ...clayPill, background: '#F5F6F8', color: '#B0BEC5', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>PREVIEW</span>
          </div>

          <div style={{
            padding: '20px', borderRadius: '16px',
            background: '#FAFBFC', border: '2px dashed rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{ ...cardBase, padding: '20px' }}>
              {/* Title Row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1A2E35', margin: 0, flex: 1 }}>{formData.title}</h3>
                {isFeatured && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px',
                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                    boxShadow: '2px 2px 6px rgba(13,148,136,0.2)',
                    whiteSpace: 'nowrap',
                  }}>Featured</span>
                )}
              </div>

              {/* Company */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                {formData.companyLogoUrl && (
                  <img src={formData.companyLogoUrl} alt={`${formData.companyName} logo`}
                    style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover', border: '1px solid rgba(0,0,0,0.06)' }}
                  />
                )}
                <span style={{ fontSize: '14px', color: '#6B7F8A' }}>{formData.companyName}</span>
              </div>

              {/* Location */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: '#8A9BA6', marginBottom: '10px' }}>
                <MapPin size={14} /> {formData.location}
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {formData.jobType && <span style={{ ...clayPill, background: '#CCFBF1', color: '#0D9488' }}>{formData.jobType}</span>}
                {formData.mode && <span style={{ ...clayPill, background: '#CCFBF1', color: '#0D9488' }}>{formData.mode}</span>}
                {formData.setting && <span style={{ ...clayPill, background: '#EDE9FE', color: '#7C3AED' }}>{formData.setting}</span>}
                {formData.population && <span style={{ ...clayPill, background: '#DBEAFE', color: '#2563EB' }}>{formData.population}</span>}
              </div>

              {salary && <p style={{ fontSize: '15px', fontWeight: 700, color: '#059669', margin: '0 0 6px' }}>{salary}</p>}
              <p style={{ fontSize: '12px', color: '#B0BEC5' }}>Just posted</p>
            </div>
          </div>
        </div>

        {/* Section 2: Detail Page */}
        <div style={{ ...cardBase, padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>Job detail page</h2>
            <span style={{ ...clayPill, background: '#F5F6F8', color: '#B0BEC5', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>PREVIEW</span>
          </div>

          <div style={{
            padding: '20px', borderRadius: '16px',
            background: '#FAFBFC', border: '2px dashed rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>{formData.title}</h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                {formData.companyLogoUrl && (
                  <img src={formData.companyLogoUrl} alt={`${formData.companyName} logo`}
                    style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'contain', border: '1px solid rgba(0,0,0,0.06)' }}
                  />
                )}
                <span style={{ fontSize: '16px', color: '#6B7F8A' }}>{formData.companyName}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '13px', color: '#6B7F8A', marginBottom: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MapPin size={16} /> {formData.location}</span>
                {formData.jobType && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Briefcase size={16} /> {formData.jobType}</span>}
                {formData.mode && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Monitor size={16} /> {formData.mode}</span>}
              </div>

              {salary && (
                <p style={{ fontSize: '18px', fontWeight: 700, color: '#059669', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <DollarSign size={18} /> {salary}
                </p>
              )}

              <div
                style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'anywhere', overflow: 'hidden' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(formData.description) }}
              />

              {formData.benefits && formData.benefits.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Benefits & Perks</h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {formData.benefits.map((b) => (
                      <span key={b} style={{ ...clayPill, background: '#D1FAE5', color: '#059669', fontSize: '12px' }}>✓ {b}</span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                {formData.applyOnPlatform ? (
                  <div>
                    <div style={{
                      ...clayBtn,
                      background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                      boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                    }}>Apply Now</div>
                    <div style={{
                      marginTop: '10px', padding: '10px 14px', borderRadius: '12px',
                      background: '#F0FDFA', border: '1px solid #99F6E4',
                      display: 'flex', alignItems: 'flex-start', gap: '8px',
                    }}>
                      <span style={{ color: '#0D9488', fontSize: '14px' }}>✅</span>
                      <p style={{ fontSize: '12px', color: '#115E59', margin: 0, lineHeight: 1.5 }}>
                        Candidates apply directly on this platform. Applications appear in your dashboard.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <a href={formData.applyUrl} target="_blank" rel="noopener noreferrer" style={{
                      ...clayBtn,
                      background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                      boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                      textDecoration: 'none',
                    }}>
                      Apply Now <ExternalLink size={16} />
                    </a>
                    <p style={{ marginTop: '8px', fontSize: '11px', color: '#B0BEC5' }}>Opens in a new tab — verify your link works.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Pricing Summary */}
        {config.isPaidPostingEnabled ? (
          <div style={{ ...cardBase, padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: '0 0 16px' }}>Pricing Summary</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: '12px' }}>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>
                  {effectiveTier === 'premium' ? 'Premium' : effectiveTier === 'growth' ? 'Growth' : 'Starter'} Job Post
                </p>
                <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '4px 0 0' }}>
                  {effectiveTier === 'premium' ? '✓ Everything in Growth ✓ Unlimited unlocks ✓ 90 days'
                    : effectiveTier === 'growth' ? '✓ Priority placement ✓ Featured badge ✓ 60 days'
                    : '✓ 30 days active ✓ Email to subscribers'}
                </p>
              </div>
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#0D9488' }}>{priceLabel}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#8A9BA6', lineHeight: 1.7 }}>
              <p style={{ margin: '0' }}>• Your job will go live immediately after payment</p>
              <p style={{ margin: '0' }}>• Edit or update your listing anytime via email link</p>
              <p style={{ margin: '0' }}>• Reach thousands of qualified PMHNPs actively looking</p>
            </div>
          </div>
        ) : (
          <div style={{ ...cardBase, padding: '20px', marginBottom: '24px', background: '#F0FDFA', border: '1px solid #99F6E4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(145deg, #0D9488, #10B981)',
                boxShadow: '3px 3px 8px rgba(13,148,136,0.2)',
              }}>
                <Check size={18} color="#fff" />
              </div>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>Growth Package — Free during launch</p>
                <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '2px 0 0' }}>Your job goes live immediately with all Growth features included.</p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ ...cardBase, padding: '14px 18px', marginBottom: '16px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          ...cardBase, padding: '16px 20px',
          display: 'flex', flexDirection: 'row', gap: '12px',
          position: 'sticky', bottom: '16px',
        }}>
          <button onClick={handleBack} disabled={isLoading} className="preview-btn" style={{
            ...clayBtn, flex: 1, justifyContent: 'center',
            background: '#F5F6F8', color: '#6B7F8A',
          }}>
            <ChevronLeft size={16} /> Back to Edit
          </button>
          <button onClick={handleContinue} disabled={isLoading} className="preview-btn-primary" style={{
            ...clayBtn, flex: 1, justifyContent: 'center',
            background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
            boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
            opacity: isLoading ? 0.6 : 1,
          }}>
            {isLoading ? (
              <><Loader2 size={16} className="animate-spin" /> Processing...</>
            ) : config.isPaidPostingEnabled ? (
              <>Looks Good — Continue to Payment <ChevronRight size={16} /></>
            ) : (
              <>Looks Good — Post Job (Free) <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .preview-btn:hover { transform: translateY(-1px); }
        .preview-btn-primary:hover { transform: translateY(-1px); box-shadow: 6px 6px 16px rgba(13,148,136,0.3), inset 1px 1px 2px rgba(255,255,255,0.15) !important; }
      `}</style>
    </div>
  );
}
