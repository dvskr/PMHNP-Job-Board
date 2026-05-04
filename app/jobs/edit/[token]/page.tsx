'use client';

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Job } from '@/lib/types';
import { config } from '@/lib/config';
import { trackBeginCheckout } from '@/lib/analytics';
import { AlertTriangle, CheckCircle, RefreshCw, Briefcase, FileText, DollarSign, Mail, Check, ChevronLeft, ChevronRight, Save } from 'lucide-react';

const ReactQuill = lazy(() => import('react-quill-new'));
import 'react-quill-new/dist/quill.snow.css';
import ScreeningQuestionsBuilder from '@/components/ScreeningQuestionsBuilder';

const editJobSchema = z.object({
  title: z.string().min(10, 'Job title must be at least 10 characters'),
  location: z.string().min(1, 'Location is required'),
  mode: z.enum(['Remote', 'Hybrid', 'In-Person'], {
    message: 'Please select a work mode',
  }),
  jobType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Per Diem'], {
    message: 'Please select a job type',
  }),
  setting: z.string().optional().or(z.literal('')),
  population: z.string().optional().or(z.literal('')),
  salaryMin: z.number().positive().optional().nullable(),
  salaryMax: z.number().positive().optional().nullable(),
  salaryPeriod: z.enum(['hourly', 'weekly', 'monthly', 'annual']).optional(),
  benefits: z.array(z.string()).optional(),
  description: z.string().min(200, 'Job description must be at least 200 characters'),
  applyOnPlatform: z.boolean().optional(),
  applyUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  contactEmail: z.string().email('Must be a valid email address'),
  companyWebsite: z.string().url('Must be a valid URL').optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.applyOnPlatform && (!data.applyUrl || data.applyUrl.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Application URL is required when not using in-platform applications',
      path: ['applyUrl'],
    });
  }
});

type EditJobFormData = z.infer<typeof editJobSchema>;

const SETTING_OPTIONS = [
  'Outpatient', 'Inpatient', 'Community Health', 'Telehealth',
  'Private Practice', 'Corrections', 'VA / Military', 'Academic',
  'Emergency / Crisis', 'Residential',
] as const;

const POPULATION_OPTIONS = [
  'Adults', 'Child & Adolescent', 'Geriatric', 'All Ages',
  'Substance Use / Dual Diagnosis', 'Forensic',
] as const;

const BENEFIT_OPTIONS = [
  'Health Insurance', 'Dental & Vision', 'PTO / Vacation',
  'CME Allowance', 'Malpractice Coverage', '401k / Retirement',
  'Loan Repayment', 'Flexible Schedule', 'Sign-on Bonus',
  'Relocation Assistance', 'Tuition Reimbursement', 'Life Insurance',
] as const;

const SALARY_PERIODS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
] as const;

interface EmployerJobData {
  id: string;
  employerName: string;
  contactEmail: string;
  companyWebsite: string | null;
  paymentStatus: string;
}

const workModes = ['Remote', 'Hybrid', 'In-Person'] as const;
const jobTypes = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'] as const;

const quillModules = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

const quillFormats = ['header', 'bold', 'italic', 'underline', 'list', 'link'];

/* ═══ Clay Design Tokens — mirror the post-job page so the edit page feels native ═══ */
const cardBase: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayInput: React.CSSProperties = {
  width: '100%', padding: '12px 16px', fontSize: '14px',
  borderRadius: '14px', border: '1px solid rgba(0,0,0,0.08)',
  background: '#F5F6F8', color: '#1A2E35',
  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
  outline: 'none', fontFamily: 'inherit',
  transition: 'all 0.2s ease',
};

const clayInputError: React.CSSProperties = {
  ...clayInput,
  border: '1.5px solid #EF4444',
  boxShadow: 'inset 2px 2px 4px rgba(239,68,68,0.06), inset -1px -1px 2px rgba(255,255,255,0.5)',
};

const clayBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '12px 24px', borderRadius: '14px',
  fontSize: '14px', fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
  cursor: 'pointer', transition: 'all 0.2s ease',
  textDecoration: 'none', background: '#fff',
};

const clayPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '10px 20px', borderRadius: '14px',
  fontSize: '14px', fontWeight: 500,
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.4)',
  cursor: 'pointer', transition: 'all 0.2s ease',
  background: '#F5F6F8', color: '#6B7F8A',
};

const clayPillActive: React.CSSProperties = {
  ...clayPill,
  background: 'linear-gradient(145deg, #0D9488, #10B981)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)',
  boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
};

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '8px',
};

const errorText: React.CSSProperties = {
  marginTop: '6px', fontSize: '12px', color: '#DC2626', fontWeight: 500,
};

/* ═══ Edit Wizard Steps ═══
 * Intentionally a subset of post-job's steps. Excluded:
 *   - Plan / pricing (would let employers shift tier without paying)
 *   - companyName / branding (set once at posting; managed in /employer/settings)
 *   - expiresAt / isPublished / isFeatured / archivedAt (have dedicated flows)
 */
type StepId = 1 | 2 | 3 | 4;
const EDIT_STEPS: { id: StepId; label: string; icon: typeof Briefcase; fields: (keyof EditJobFormData)[] }[] = [
  { id: 1, label: 'Basics',      icon: Briefcase,   fields: ['title', 'location', 'mode', 'jobType', 'setting', 'population'] },
  { id: 2, label: 'Description', icon: FileText,    fields: ['description'] },
  { id: 3, label: 'Pay & Apply', icon: DollarSign,  fields: ['salaryMin', 'salaryMax', 'salaryPeriod', 'benefits', 'applyOnPlatform', 'applyUrl'] },
  { id: 4, label: 'Contact',     icon: Mail,        fields: ['contactEmail', 'companyWebsite'] },
];

function EditStepProgressBar({ currentStep, onStepClick, completedSteps }: {
  currentStep: StepId;
  onStepClick: (step: StepId) => void;
  completedSteps: Set<StepId>;
}) {
  return (
    <div style={{
      ...cardBase, padding: '14px 18px', marginBottom: '20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '4px', overflow: 'hidden',
    }}>
      {EDIT_STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isCompleted = completedSteps.has(step.id);
        const isClickable = isCompleted || step.id <= currentStep;

        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.id)}
              className="edit-step-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', borderRadius: '12px',
                background: isActive
                  ? 'linear-gradient(145deg, #0D9488, #10B981)'
                  : isCompleted ? '#D1FAE5' : '#F5F6F8',
                color: isActive ? '#fff' : isCompleted ? '#059669' : '#8A9BA6',
                border: 'none',
                cursor: isClickable ? 'pointer' : 'default',
                fontSize: '12px', fontWeight: 600,
                boxShadow: isActive
                  ? '3px 3px 8px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)'
                  : 'inset 1px 1px 2px rgba(0,0,0,0.03)',
                transition: 'all 0.25s ease',
                whiteSpace: 'nowrap',
                opacity: isClickable ? 1 : 0.5,
              }}
            >
              {isCompleted && !isActive ? <Check size={14} /> : <Icon size={14} />}
              <span className="edit-step-label">{step.label}</span>
            </button>
            {i < EDIT_STEPS.length - 1 && (
              <div style={{
                flex: 1, height: '2px', margin: '0 8px',
                background: isCompleted ? '#10B981' : '#E5E7EB',
                borderRadius: '1px', transition: 'background 0.3s ease',
                minWidth: '14px',
              }} />
            )}
          </div>
        );
      })}
      <style>{`
        @media (max-width: 640px) {
          .edit-step-label { display: none; }
          .edit-step-btn { padding: 8px !important; }
        }
      `}</style>
    </div>
  );
}

export default function EditJobPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [job, setJob] = useState<Job | null>(null);
  const [employerJob, setEmployerJob] = useState<EmployerJobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewingTier, setRenewingTier] = useState<'pro' | null>(null);
  const [isApplyOnPlatform, setIsApplyOnPlatform] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    reset,
    trigger,
    watch,
    setValue,
  } = useForm<EditJobFormData>({
    resolver: zodResolver(editJobSchema),
  });

  const applyOnPlatform = watch('applyOnPlatform');
  const salaryPeriod = watch('salaryPeriod');
  const benefits = watch('benefits') || [];

  // Per-step validation — only validate the fields owned by the current step
  // when the user clicks Continue. Final step validates everything via the
  // form's onSubmit path.
  const handleNext = async () => {
    const step = EDIT_STEPS.find(s => s.id === currentStep);
    if (!step) return;
    const fieldsToValidate = step.fields.filter(f =>
      // Skip applyUrl validation when the post is on-platform — there's no
      // input to fill in that case.
      !(f === 'applyUrl' && applyOnPlatform)
    );
    const valid = await trigger(fieldsToValidate);
    if (!valid) return;
    setCompletedSteps(prev => new Set(prev).add(currentStep));
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as StepId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as StepId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStepJump = (step: StepId) => {
    if (completedSteps.has(step) || step <= currentStep) {
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const resolvedParams = await params;
        setToken(resolvedParams.token);

        const response = await fetch(`/api/jobs/edit/${resolvedParams.token}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch job');
        }

        setJob(data.job);
        setEmployerJob(data.employerJob);
        setIsApplyOnPlatform(data.job.applyOnPlatform || false);

        // Hydrate the screening-questions builder via the same localStorage key
        // post-job uses, so the builder pre-loads the existing questions.
        try {
          const existingQs = Array.isArray(data.job.screeningQuestions)
            ? data.job.screeningQuestions.map((q: { questionText: string; questionType: string; options?: string[]; isRequired: boolean; isKnockout: boolean; knockoutAnswer: string | null }) => ({
                id: crypto.randomUUID(),
                text: q.questionText,
                type: q.questionType,
                options: q.options || [],
                required: q.isRequired,
                knockout: q.isKnockout,
                knockoutAnswer: q.knockoutAnswer || '',
              }))
            : [];
          localStorage.setItem('jobScreeningQuestions', JSON.stringify(existingQs));
        } catch { /* ignore */ }

        // Pre-fill form
        reset({
          title: data.job.title,
          location: data.job.location,
          mode: data.job.mode as 'Remote' | 'Hybrid' | 'In-Person',
          jobType: data.job.jobType as 'Full-Time' | 'Part-Time' | 'Contract' | 'Per Diem',
          setting: data.job.setting || '',
          population: data.job.population || '',
          salaryMin: data.job.minSalary,
          salaryMax: data.job.maxSalary,
          salaryPeriod: (data.job.salaryPeriod as 'hourly' | 'weekly' | 'monthly' | 'annual' | undefined) || 'annual',
          benefits: Array.isArray(data.job.benefits) ? data.job.benefits : [],
          description: data.job.description,
          applyOnPlatform: !!data.job.applyOnPlatform,
          applyUrl: data.job.applyLink || '',
          contactEmail: data.employerJob.contactEmail,
          companyWebsite: data.employerJob.companyWebsite || '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [params, reset]);

  const onSubmit = async (data: EditJobFormData) => {
    try {
      setUpdateSuccess(false);
      setError(null);

      // Pull screening questions from the builder's localStorage. This mirrors
      // how the post-job page collects them at submit time.
      let screeningQuestions: { text: string; type: string; options?: string[]; required?: boolean; knockout?: boolean; knockoutAnswer?: string }[] = [];
      try {
        const stored = localStorage.getItem('jobScreeningQuestions');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            screeningQuestions = parsed.map((q: { text?: string; type?: string; options?: string[]; required?: boolean; knockout?: boolean; knockoutAnswer?: string }) => ({
              text: q.text || '',
              type: q.type || 'boolean',
              options: q.options || [],
              required: q.required || false,
              knockout: q.knockout || false,
              knockoutAnswer: q.knockoutAnswer || '',
            }));
          }
        }
      } catch { /* ignore */ }

      const response = await fetch('/api/jobs/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          jobData: {
            title: data.title,
            location: data.location,
            mode: data.mode,
            jobType: data.jobType,
            setting: data.setting || null,
            population: data.population || null,
            description: data.description,
            applyOnPlatform: !!data.applyOnPlatform,
            applyLink: data.applyOnPlatform ? null : (data.applyUrl || null),
            minSalary: data.salaryMin,
            maxSalary: data.salaryMax,
            salaryPeriod: data.salaryPeriod || 'annual',
            benefits: Array.isArray(data.benefits) ? data.benefits : [],
            contactEmail: data.contactEmail,
            companyWebsite: data.companyWebsite || null,
            // Only send screening questions when on-platform — otherwise wipe them
            // by sending [] so a switch from on-platform → external clears stale Qs.
            screeningQuestions: data.applyOnPlatform ? screeningQuestions : [],
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update job');
      }

      setUpdateSuccess(true);
      setJob(result.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    }
  };

  const handleUnpublish = async () => {
    try {
      setUnpublishing(true);
      setError(null);

      const response = await fetch(`/api/jobs/update?token=${token}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to unpublish job');
      }

      // Redirect to jobs page
      router.push('/jobs?unpublished=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpublish job');
      setUnpublishing(false);
    }
  };

  const isExpired = (): boolean => {
    if (!job?.expiresAt) return false;
    return new Date(job.expiresAt) < new Date();
  };

  const isExpiringSoon = (): boolean => {
    if (!job?.expiresAt) return false;
    const daysUntilExpiry = Math.ceil(
      (new Date(job.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  };

  const shouldShowRenew = (): boolean => {
    return isExpired() || isExpiringSoon();
  };

  const handleRenewCheckout = async (tier: 'pro') => {
    if (!job) return;

    setRenewingTier(tier);
    setShowRenewModal(false);

    // P7: fire begin_checkout for renewal
    trackBeginCheckout(config.stripeRenewalPriceInCents, 'renewal');

    try {
      const response = await fetch('/api/create-renewal-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          editToken: token,
          tier,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to create checkout');
      }

      // Redirect to Stripe checkout
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      console.error('Renewal checkout error:', err);
      alert(err instanceof Error ? err.message : 'Failed to start renewal process');
      setRenewingTier(null);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ background: '#F5F0EB', minHeight: '100vh' }}>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
              <p className="text-gray-600">Loading job details...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state (invalid token)
  if (error && !job) {
    return (
      <div style={{ background: '#F5F0EB', minHeight: '100vh' }}>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Edit Link</h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">
              This link may have expired or is invalid. Please check your email for the correct edit link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '16px 0 60px' }}>
      <div className="max-w-3xl mx-auto px-4">

      {/* Success Message */}
      {updateSuccess && (
        <div style={{
          ...cardBase, padding: '14px 18px', marginBottom: '20px',
          background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.18)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <CheckCircle size={18} style={{ color: '#0D9488' }} />
          <p style={{ fontSize: '13px', color: '#115E59', fontWeight: 600, margin: 0 }}>Job updated successfully!</p>
        </div>
      )}

      {/* Error Message */}
      {error && job && (
        <div style={{
          ...cardBase, padding: '14px 18px', marginBottom: '20px',
          background: '#FEF2F2', border: '1px solid #FECACA',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <AlertTriangle size={18} style={{ color: '#DC2626' }} />
          <p style={{ fontSize: '13px', color: '#991B1B', fontWeight: 500, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Expiry Warning & Renew Section */}
      {shouldShowRenew() && job && (() => {
        const expired = isExpired();
        const accentBg = expired ? '#FEE2E2' : '#FEF3C7';
        const accentBorder = expired ? '#FECACA' : '#FDE68A';
        const accentColor = expired ? '#991B1B' : '#92400E';
        const expiryDate = new Date(job.expiresAt!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return (
          <div style={{
            ...cardBase, padding: '20px 22px', marginBottom: '20px',
            background: accentBg, border: `1px solid ${accentBorder}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#fff', color: accentColor,
                boxShadow: '3px 3px 8px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.5)',
              }}>
                <AlertTriangle size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{
                  fontSize: '16px', fontWeight: 700,
                  fontFamily: 'var(--font-lora), Georgia, serif',
                  color: accentColor, margin: '0 0 4px',
                }}>
                  {expired ? 'This job has expired' : 'This job expires soon'}
                </h3>
                <p style={{ fontSize: '13px', color: accentColor, margin: '0 0 14px', lineHeight: 1.5, opacity: 0.85 }}>
                  {expired
                    ? `Expired on ${expiryDate} — no longer visible to candidates. Renew to relist.`
                    : `Expires on ${expiryDate}. Renew now to keep it visible.`}
                </p>
                <button
                  onClick={() => setShowRenewModal(true)}
                  disabled={renewingTier !== null}
                  style={{
                    ...clayBtn,
                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                    border: 'none',
                    boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                    opacity: renewingTier ? 0.6 : 1,
                  }}
                >
                  <RefreshCw size={16} className={renewingTier ? 'animate-spin' : ''} />
                  {renewingTier ? 'Processing...' : 'Renew This Job'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Step Progress ═══ */}
      <EditStepProgressBar
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={handleStepJump}
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* ═══ Step 1 — Basics: title, location, mode, jobType ═══ */}
        {currentStep === 1 && (
          <div style={{ ...cardBase, padding: '28px 24px', marginBottom: '20px' }}>
            <h2 style={{
              fontSize: '17px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', margin: '0 0 4px',
            }}>Job Basics</h2>
            <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '0 0 20px' }}>
              The core details candidates see at the top of your listing.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label htmlFor="title" style={fieldLabel}>
                  Job Title <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text" id="title"
                  {...register('title')}
                  style={errors.title ? clayInputError : clayInput}
                />
                {errors.title && <p style={errorText}>{errors.title.message}</p>}
              </div>

              <div>
                <label htmlFor="location" style={fieldLabel}>
                  Location <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text" id="location"
                  placeholder="e.g. Remote, New York NY"
                  {...register('location')}
                  style={errors.location ? clayInputError : clayInput}
                />
                {errors.location && <p style={errorText}>{errors.location.message}</p>}
              </div>

              <div>
                <label style={fieldLabel}>
                  Work Mode <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <Controller
                  name="mode"
                  control={control}
                  render={({ field }) => (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {workModes.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => field.onChange(mode)}
                          style={field.value === mode ? clayPillActive : clayPill}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}
                />
                {errors.mode && <p style={errorText}>{errors.mode.message}</p>}
              </div>

              <div>
                <label style={fieldLabel}>
                  Job Type <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <Controller
                  name="jobType"
                  control={control}
                  render={({ field }) => (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {jobTypes.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => field.onChange(type)}
                          style={field.value === type ? clayPillActive : clayPill}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                />
                {errors.jobType && <p style={errorText}>{errors.jobType.message}</p>}
              </div>

              {/* Clinical Setting */}
              <div>
                <label htmlFor="setting" style={fieldLabel}>
                  Clinical Setting <span style={{ fontWeight: 400, color: '#B0BEC5', fontSize: '12px' }}>(optional)</span>
                </label>
                <select id="setting" {...register('setting')} style={clayInput} defaultValue="">
                  <option value="">Select a setting...</option>
                  {SETTING_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Patient Population */}
              <div>
                <label htmlFor="population" style={fieldLabel}>
                  Patient Population <span style={{ fontWeight: 400, color: '#B0BEC5', fontSize: '12px' }}>(optional)</span>
                </label>
                <select id="population" {...register('population')} style={clayInput} defaultValue="">
                  <option value="">Select a population...</option>
                  {POPULATION_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step 2 — Description ═══ */}
        {currentStep === 2 && (
          <div style={{ ...cardBase, padding: '28px 24px', marginBottom: '20px' }}>
            <h2 style={{
              fontSize: '17px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', margin: '0 0 4px',
            }}>Job Description</h2>
            <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '0 0 20px' }}>
              Cover the role, responsibilities, requirements, and what makes this opportunity special. Minimum 200 characters.
            </p>
            <style>{`
              .clay-quill-wrap .ql-toolbar { border-radius: 14px 14px 0 0; border: 1px solid rgba(0,0,0,0.08); border-bottom: none; background: #fff; }
              .clay-quill-wrap .ql-container { border-radius: 0 0 14px 14px; border: 1px solid rgba(0,0,0,0.08); background: #F5F6F8; box-shadow: inset 2px 2px 4px rgba(0,0,0,0.03); }
              .clay-quill-wrap .ql-editor { min-height: 320px !important; font-family: inherit; font-size: 14px; color: #1A2E35; }
            `}</style>
            <div className="clay-quill-wrap">
              <Suspense fallback={<div style={{ height: '360px', borderRadius: '14px', background: '#F5F6F8' }} />}>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <ReactQuill
                      theme="snow"
                      value={field.value || ''}
                      onChange={(content: string) => {
                        const text = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                        field.onChange(text.length > 0 ? content : '');
                      }}
                      modules={quillModules}
                      formats={quillFormats}
                      placeholder="Describe the role, responsibilities, requirements, benefits..."
                    />
                  )}
                />
              </Suspense>
            </div>
            {errors.description && <p style={errorText}>{errors.description.message}</p>}
          </div>
        )}

        {/* ═══ Step 3 — Pay, Benefits & Apply ═══ */}
        {currentStep === 3 && (
          <div style={{ ...cardBase, padding: '28px 24px', marginBottom: '20px' }}>
            <h2 style={{
              fontSize: '17px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', margin: '0 0 4px',
            }}>Compensation, Benefits &amp; Apply</h2>
            <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '0 0 20px' }}>
              Posts with a salary range get 2× more apply clicks than those without.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Salary Range with pay period pills */}
              <div>
                <label style={fieldLabel}>Salary Range</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {SALARY_PERIODS.map((period) => (
                    <button
                      key={period.value}
                      type="button"
                      onClick={() => setValue('salaryPeriod', period.value)}
                      style={salaryPeriod === period.value ? { ...clayPillActive, padding: '8px 16px', fontSize: '13px' } : { ...clayPill, padding: '8px 16px', fontSize: '13px' }}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <input
                    type="number" inputMode="numeric"
                    placeholder={`Min ${salaryPeriod === 'hourly' ? '$/hr' : '$ ' + (salaryPeriod || 'annual')}`}
                    {...register('salaryMin', { valueAsNumber: true })}
                    style={{ ...clayInput, flex: 1, minWidth: '140px' }}
                  />
                  <input
                    type="number" inputMode="numeric"
                    placeholder={`Max ${salaryPeriod === 'hourly' ? '$/hr' : '$ ' + (salaryPeriod || 'annual')}`}
                    {...register('salaryMax', { valueAsNumber: true })}
                    style={{ ...clayInput, flex: 1, minWidth: '140px' }}
                  />
                </div>
              </div>

              {/* Benefits multi-select grid */}
              <div>
                <label style={fieldLabel}>Benefits &amp; Perks</label>
                <Controller
                  name="benefits"
                  control={control}
                  render={({ field }) => {
                    const value = (field.value as string[] | undefined) || [];
                    const toggle = (b: string) => {
                      field.onChange(value.includes(b) ? value.filter(x => x !== b) : [...value, b]);
                    };
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                        {BENEFIT_OPTIONS.map((benefit) => {
                          const selected = value.includes(benefit);
                          return (
                            <button
                              key={benefit}
                              type="button"
                              onClick={() => toggle(benefit)}
                              style={{
                                ...clayPill, padding: '8px 12px', fontSize: '12px',
                                justifyContent: 'flex-start', gap: '6px',
                                ...(selected
                                  ? { background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0', boxShadow: '2px 2px 5px rgba(5,150,105,0.08), inset 1px 1px 2px rgba(255,255,255,0.5)' }
                                  : {}),
                              }}
                            >
                              {selected ? '✓' : '+'} {benefit}
                            </button>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                <p style={{ marginTop: '8px', fontSize: '11px', color: '#B0BEC5' }}>
                  {benefits.length} selected
                </p>
              </div>

              {/* Apply Method */}
              <div>
                <label style={fieldLabel}>
                  How should candidates apply? <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* External */}
                  <label style={{
                    ...cardBase, padding: '14px 16px', cursor: 'pointer',
                    border: !applyOnPlatform ? '2px solid #0D9488' : '1px solid rgba(0,0,0,0.06)',
                    background: !applyOnPlatform ? '#F0FDFA' : '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <input
                        type="radio"
                        checked={!applyOnPlatform}
                        onChange={() => { setValue('applyOnPlatform', false); setIsApplyOnPlatform(false); }}
                        style={{ marginTop: '3px', accentColor: '#0D9488', width: '16px', height: '16px' }}
                      />
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35' }}>External Application URL</span>
                        <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '2px 0 0' }}>Candidates are redirected to your website or ATS</p>
                      </div>
                    </div>
                  </label>

                  {/* Platform */}
                  <label style={{
                    ...cardBase, padding: '14px 16px', cursor: 'pointer',
                    border: applyOnPlatform ? '2px solid #0D9488' : '1px solid rgba(0,0,0,0.06)',
                    background: applyOnPlatform ? '#F0FDFA' : '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <input
                        type="radio"
                        checked={applyOnPlatform === true}
                        onChange={() => { setValue('applyOnPlatform', true); setValue('applyUrl', ''); setIsApplyOnPlatform(true); }}
                        style={{ marginTop: '3px', accentColor: '#0D9488', width: '16px', height: '16px' }}
                      />
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35' }}>Receive on PMHNP Hiring</span>
                        <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '2px 0 0' }}>Candidates apply directly — applications arrive in your dashboard</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                          {['Resume', 'Cover letter', 'Email alerts'].map(f => (
                            <span key={f} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', background: '#CCFBF1', color: '#0D9488', fontWeight: 500 }}>✓ {f}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>
                </div>

                {/* External URL input */}
                {!applyOnPlatform && (
                  <div style={{ marginTop: '12px' }}>
                    <label htmlFor="applyUrl" style={fieldLabel}>
                      Application URL <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <input
                      type="url" id="applyUrl"
                      placeholder="https://www.example.com/careers/apply"
                      {...register('applyUrl')}
                      style={errors.applyUrl ? clayInputError : clayInput}
                    />
                    {errors.applyUrl && <p style={errorText}>{errors.applyUrl.message}</p>}
                    <div style={{
                      background: '#FEF3C7', border: '1px solid #FDE68A',
                      borderRadius: '10px', padding: '8px 12px', marginTop: '8px',
                      fontSize: '11px', color: '#92400E',
                    }}>
                      💡 Use a direct application link, not your homepage.
                    </div>
                  </div>
                )}

                {/* Screening Questions builder — only when on-platform */}
                {applyOnPlatform && (
                  <div style={{ marginTop: '16px' }}>
                    <ScreeningQuestionsBuilder />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step 4 — Contact ═══ */}
        {currentStep === 4 && (
          <div style={{ ...cardBase, padding: '28px 24px', marginBottom: '20px' }}>
            <h2 style={{
              fontSize: '17px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', margin: '0 0 4px',
            }}>Contact</h2>
            <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '0 0 20px' }}>
              Where applicant notifications go and an optional public link to your careers page.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label htmlFor="contactEmail" style={fieldLabel}>
                  Contact Email <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="email" id="contactEmail"
                  {...register('contactEmail')}
                  style={errors.contactEmail ? clayInputError : clayInput}
                />
                {errors.contactEmail && <p style={errorText}>{errors.contactEmail.message}</p>}
              </div>

              <div>
                <label htmlFor="companyWebsite" style={fieldLabel}>Company Website</label>
                <input
                  type="url" id="companyWebsite"
                  placeholder="https://your-company.com"
                  {...register('companyWebsite')}
                  style={errors.companyWebsite ? clayInputError : clayInput}
                />
                {errors.companyWebsite && <p style={errorText}>{errors.companyWebsite.message}</p>}
              </div>

              <div style={{
                background: '#F8FAFC', border: '1px solid rgba(0,0,0,0.05)',
                borderRadius: '12px', padding: '12px 14px',
                fontSize: '11px', color: '#6B7F8A', lineHeight: 1.5,
              }}>
                <strong style={{ color: '#1A2E35' }}>Not editable here:</strong> company name &amp; logo (Settings → Company Profile),
                pricing tier, expiry date, paused/featured/archived state — those have their own dedicated controls.
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step Navigation Footer ═══ */}
        <div style={{
          ...cardBase, padding: '16px 20px',
          display: 'flex', gap: '12px', flexWrap: 'wrap',
          justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', bottom: '12px', zIndex: 10,
        }}>
          <button
            type="button"
            onClick={() => setShowUnpublishConfirm(true)}
            style={{
              ...clayBtn,
              background: '#FEF2F2', color: '#DC2626',
              border: '1px solid #FECACA',
            }}
          >
            Unpublish
          </button>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  ...clayBtn,
                  background: '#F5F0EB', color: '#6B7F8A',
                }}
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                style={{
                  ...clayBtn,
                  background: 'linear-gradient(145deg, #10B981, #0D9488)', color: '#fff',
                  border: 'none', padding: '12px 24px',
                  boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                Continue <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  ...clayBtn,
                  background: 'linear-gradient(145deg, #10B981, #0D9488)', color: '#fff',
                  border: 'none', padding: '12px 28px',
                  boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                  opacity: isSubmitting ? 0.6 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Unpublish Confirmation Modal */}
      {showUnpublishConfirm && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            ...cardBase, maxWidth: '440px', width: '100%', padding: '24px',
            boxShadow: '12px 12px 30px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#FEF2F2', color: '#DC2626',
                boxShadow: '3px 3px 8px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.5)',
              }}>
                <AlertTriangle size={20} />
              </div>
              <h3 style={{
                fontSize: '18px', fontWeight: 700,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', margin: 0,
              }}>Unpublish this job?</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#6B7F8A', lineHeight: 1.5, margin: '0 0 20px' }}>
              The listing will be removed from the public job board. Existing applications and analytics are preserved. Contact support if you need to republish later.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowUnpublishConfirm(false)}
                style={{
                  ...clayBtn, flex: 1, justifyContent: 'center',
                  background: '#F5F0EB', color: '#6B7F8A',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUnpublish}
                disabled={unpublishing}
                style={{
                  ...clayBtn, flex: 1, justifyContent: 'center',
                  background: 'linear-gradient(145deg, #DC2626, #B91C1C)', color: '#fff',
                  border: 'none',
                  boxShadow: '4px 4px 12px rgba(220,38,38,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                  opacity: unpublishing ? 0.6 : 1,
                  cursor: unpublishing ? 'not-allowed' : 'pointer',
                }}
              >
                {unpublishing ? 'Unpublishing...' : 'Yes, Unpublish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal — free posts can't be renewed at the discounted rate */}
      {showRenewModal && job && employerJob?.paymentStatus === 'free' && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            ...cardBase, maxWidth: '460px', width: '100%', padding: '24px',
            boxShadow: '12px 12px 30px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
          }}>
            <h3 style={{
              fontSize: '18px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', margin: '0 0 4px',
            }}>This free post can&apos;t be renewed</h3>
            <p style={{ fontSize: '13px', color: '#8A9BA6', margin: '0 0 16px' }}>{job.title}</p>

            <p style={{ fontSize: '14px', color: '#1A2E35', lineHeight: 1.6, margin: '0 0 8px' }}>
              Renewals at the discounted ${config.renewalPrice} rate are available for paid postings only.
            </p>
            <p style={{ fontSize: '13px', color: '#6B7F8A', lineHeight: 1.6, margin: '0 0 20px' }}>
              You can post this role again as a fresh listing for ${config.postingPrice} — same {config.durationDays}-day duration and a new bucket of {config.limits.candidateUnlocksPerPosting} unlocks &amp; {config.limits.inmailsPerPosting} InMails.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a href="/post-job" style={{
                ...clayBtn, justifyContent: 'center',
                background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                border: 'none', padding: '12px 16px', fontWeight: 700,
                boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}>
                Post a New Job — ${config.postingPrice}
              </a>
              <button
                onClick={() => setShowRenewModal(false)}
                style={{
                  ...clayBtn, justifyContent: 'center',
                  background: '#F5F0EB', color: '#6B7F8A',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal — paid posts get the discounted renewal */}
      {showRenewModal && job && employerJob?.paymentStatus !== 'free' && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            ...cardBase, maxWidth: '460px', width: '100%', padding: '24px',
            boxShadow: '12px 12px 30px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
          }}>
            <h3 style={{
              fontSize: '18px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', margin: '0 0 4px',
            }}>Renew Job Posting</h3>
            <p style={{ fontSize: '13px', color: '#8A9BA6', margin: '0 0 18px' }}>{job.title}</p>

            <button
              onClick={() => handleRenewCheckout('pro')}
              style={{
                ...cardBase, padding: '16px 18px', textAlign: 'left', cursor: 'pointer',
                width: '100%', marginBottom: '14px',
                border: '1px solid rgba(13,148,136,0.25)',
                background: 'linear-gradient(145deg, #F0FDFA, #FFFFFF)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0D9488' }}>Renew Listing</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#0D9488', fontFamily: 'var(--font-lora), Georgia, serif' }}>${config.renewalPrice}</span>
                  <p style={{ fontSize: '11px', color: '#6B7F8A', margin: '0', fontWeight: 600 }}>Save {Math.round((1 - config.renewalPrice / config.postingPrice) * 100)}%</p>
                </div>
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#6B7F8A', lineHeight: 1.6 }}>
                <li>Adds {config.durationDays} days to your current expiration</li>
                <li>Featured placement (top of list)</li>
                <li>{config.limits.candidateUnlocksPerPosting} candidate unlocks · {config.limits.inmailsPerPosting} InMails</li>
              </ul>
            </button>

            <button
              onClick={() => setShowRenewModal(false)}
              style={{
                ...clayBtn, width: '100%', justifyContent: 'center',
                background: '#F5F0EB', color: '#6B7F8A',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
