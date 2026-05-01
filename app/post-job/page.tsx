'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { config } from '@/lib/config';
import { trackViewPostJobPage } from '@/lib/analytics';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import ScreeningQuestionsBuilder from '@/components/ScreeningQuestionsBuilder';
import { Building2, MapPin, FileText, DollarSign, Rocket, ChevronRight, ChevronLeft, Check, Loader2, Save, Trash2, Upload } from 'lucide-react';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'ymail.com', 'live.com', 'msn.com', 'googlemail.com'];

const jobPostingSchema = z.object({
  title: z.string().min(10, 'Job title must be at least 10 characters'),
  companyName: z.string().min(1, 'Company name is required'),
  companyWebsite: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  contactEmail: z.string().email('Must be a valid email address').refine(
    (email) => {
      const domain = email.toLowerCase().split('@')[1];
      return !FREE_EMAIL_DOMAINS.includes(domain);
    },
    { message: 'Please use your company email (not Gmail, Yahoo, etc.)' }
  ),
  location: z.string().min(1, 'Location is required'),
  mode: z.enum(['Remote', 'Hybrid', 'In-Person']),
  jobType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Per Diem']),
  salaryPeriod: z.enum(['hourly', 'weekly', 'monthly', 'annual']).optional(),
  salaryMin: z.number().positive('Minimum salary must be a positive number').optional().nullable(),
  salaryMax: z.number().positive('Maximum salary must be a positive number').optional().nullable(),
  salaryCompetitive: z.boolean().optional(),
  // Validation operates on visible-text length (HTML stripped) to match the
  // character counter shown in the UI. Quill stores formatted HTML, so a
  // raw .length() check on the field includes <p>/<ul>/<li>/<strong>/etc.
  // markup that the user can't see — leading to the bug where the counter
  // showed 4,880/5,000 but the form refused to advance because the HTML
  // was ~6,000+ chars.
  description: z.string()
    .refine(
      (html) => html.replace(/<[^>]*>/g, '').length >= 200,
      { message: 'Job description must be at least 200 characters' }
    )
    .refine(
      (html) => html.replace(/<[^>]*>/g, '').length <= 5000,
      { message: 'Job description cannot exceed 5,000 characters' }
    ),
  applyUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  applyOnPlatform: z.boolean().optional(),
  pricingTier: z.enum(['pro']),
  benefits: z.array(z.string()).optional(),
  setting: z.string().optional(),
  population: z.string().optional(),
  companyLogoUrl: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.salaryCompetitive) {
    if (!data.salaryPeriod) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select a pay period', path: ['salaryPeriod'] });
    }
    if (!data.salaryMin || data.salaryMin <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum salary is required', path: ['salaryMin'] });
    }
    if (!data.salaryMax || data.salaryMax <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Maximum salary is required', path: ['salaryMax'] });
    }
    if (data.salaryMin && data.salaryMax && data.salaryMin > data.salaryMax) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum salary cannot be greater than maximum', path: ['salaryMin'] });
    }
  }
  if (!data.applyOnPlatform && (!data.applyUrl || data.applyUrl.trim() === '')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Apply URL is required when not using platform applications', path: ['applyUrl'] });
  }
});

type JobPostingFormData = z.infer<typeof jobPostingSchema>;

const workModes = ['Remote', 'Hybrid', 'In-Person'] as const;
const jobTypes = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'] as const;
const salaryPeriods = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
] as const;

const BENEFIT_OPTIONS = [
  'Health Insurance', 'Dental & Vision', 'PTO / Vacation',
  'CME Allowance', 'Malpractice Coverage', '401k / Retirement',
  'Loan Repayment', 'Flexible Schedule', 'Sign-on Bonus',
  'Relocation Assistance', 'Tuition Reimbursement', 'Life Insurance',
] as const;

const SETTING_OPTIONS = [
  'Outpatient', 'Inpatient', 'Community Health', 'Telehealth',
  'Private Practice', 'Corrections', 'VA / Military', 'Academic',
  'Emergency / Crisis', 'Residential',
] as const;

const POPULATION_OPTIONS = [
  'Adults', 'Child & Adolescent', 'Geriatric', 'All Ages',
  'Substance Use / Dual Diagnosis', 'Forensic',
] as const;

/* ═══ Clay Design Tokens ═══ */
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
  textDecoration: 'none',
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

const STEPS = [
  { id: 1, label: 'Company', icon: Building2, fields: ['title', 'companyName', 'companyWebsite', 'contactEmail'] },
  { id: 2, label: 'Role', icon: MapPin, fields: ['location', 'mode', 'jobType'] },
  { id: 3, label: 'Description', icon: FileText, fields: ['description'] },
  { id: 4, label: 'Details', icon: DollarSign, fields: ['salaryMin', 'salaryMax', 'salaryPeriod', 'applyUrl'] },
  { id: 5, label: 'Plan', icon: Rocket, fields: ['pricingTier'] },
];

function LoadingFallback() {
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

/* ═══ Step Progress Bar ═══ */
function StepProgressBar({ currentStep, onStepClick, completedSteps }: {
  currentStep: number;
  onStepClick: (step: number) => void;
  completedSteps: Set<number>;
}) {
  return (
    <div style={{
      ...cardBase, padding: '16px 24px', marginBottom: '24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '4px', overflow: 'hidden',
    }}>
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isCompleted = completedSteps.has(step.id);
        const isClickable = isCompleted || step.id <= currentStep;

        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <button
              onClick={() => isClickable && onStepClick(step.id)}
              className="step-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', borderRadius: '12px',
                background: isActive
                  ? 'linear-gradient(145deg, #0D9488, #10B981)'
                  : isCompleted ? '#D1FAE5' : '#F5F6F8',
                color: isActive ? '#fff' : isCompleted ? '#059669' : '#8A9BA6',
                border: 'none', cursor: isClickable ? 'pointer' : 'default',
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
              <span className="step-label">{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: '2px', margin: '0 8px',
                background: isCompleted ? '#10B981' : '#E5E7EB',
                borderRadius: '1px', transition: 'background 0.3s ease',
                minWidth: '16px',
              }} />
            )}
          </div>
        );
      })}
      <style>{`
        @media (max-width: 640px) {
          .step-label { display: none; }
          .step-btn { padding: 8px !important; }
        }
      `}</style>
    </div>
  );
}


function PostJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [salaryCompetitive, setSalaryCompetitive] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveMessage, setDraftSaveMessage] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    trigger,
    getValues,
  } = useForm<JobPostingFormData>({
    resolver: zodResolver(jobPostingSchema),
    defaultValues: {
      pricingTier: 'pro',
      salaryCompetitive: false,
      salaryPeriod: 'annual',
      benefits: [],
      applyOnPlatform: false,
    },
  });

  const selectedPricingTier = watch('pricingTier');
  const contactEmail = watch('contactEmail');
  const salaryPeriod = watch('salaryPeriod');

  // P7: pricing-funnel analytics — landed on post-job page
  useEffect(() => {
    trackViewPostJobPage();
  }, []);

  // Auth + role gate. Allowlist approach: only 'employer' and 'admin' may
  // post jobs. Everyone else (job_seeker, missing role, future roles) is
  // blocked by the in-page "Wrong Account Type" screen rendered below.
  // No silent router.push — the in-page block tells the user what's wrong
  // and gives them a sign-out path.
  useEffect(() => {
    async function checkUser() {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        if (user) {
          // Use the server-side /api/auth/profile endpoint (Prisma + DATABASE_URL,
          // bypasses RLS and auto-recovers profiles whose supabase_id was relinked).
          // The previous direct supabase.from('user_profiles') query was blocked
          // by RLS for browser anon-key callers, returning null → "unknown" role
          // even when the header dropdown — which uses this same endpoint —
          // correctly showed the user as Employer.
          let role: string | null = null;
          try {
            const profileRes = await fetch('/api/auth/profile');
            if (profileRes.ok) {
              const profile = await profileRes.json();
              role = profile?.role ?? null;
            }
          } catch {
            // Network failure → treated as unknown; render path below handles it.
          }
          setUserRole(role);
          // Only employers and admins proceed to the form (auto-fill, etc.).
          if (role === 'employer' || role === 'admin') {
            if (user.email) {
              setValue('contactEmail', user.email);
            }
          }
          // For all other roles (job_seeker / null / unknown) the render
          // path below catches it and shows the wrong-account-type screen.
        }
      } catch (e) {
        console.error('Auth check failed', e);
      } finally {
        setIsAuthLoading(false);
      }
    }
    checkUser();
  }, [setValue, router]);

  // Load draft
  useEffect(() => {
    const loadFormData = async () => {
      const resumeToken = searchParams.get('resume');
      if (resumeToken) {
        try {
          const response = await fetch(`/api/job-draft?token=${resumeToken}`);
          const result = await response.json();
          if (response.ok && result.success) {
            const formData = result.formData;
            Object.keys(formData).forEach((key: string) => {
              setValue(key as keyof JobPostingFormData, formData[key as keyof JobPostingFormData]);
            });
            if (formData.salaryCompetitive) setSalaryCompetitive(true);
            if (formData.companyLogoUrl) setLogoPreview(formData.companyLogoUrl);
            setDraftLoaded(true);
          }
        } catch (err) {
          console.error('Error loading draft:', err);
        }
      } else {
        const savedData = localStorage.getItem('jobFormData');
        if (savedData) {
          try {
            const parsedData: JobPostingFormData = JSON.parse(savedData);
            Object.keys(parsedData).forEach((key: string) => {
              setValue(key as keyof JobPostingFormData, parsedData[key as keyof JobPostingFormData]);
            });
            if (parsedData.salaryCompetitive) setSalaryCompetitive(true);
            if (parsedData.companyLogoUrl) setLogoPreview(parsedData.companyLogoUrl);
          } catch (err) {
            console.error('Error loading saved form data:', err);
          }
        }
      }
      setDraftLoaded(true);
    };
    loadFormData();
  }, [setValue, searchParams]);

  // Pre-fill company fields from the employer's most recent posting after
  // draft/localStorage hydration is done. Only fills fields that are still
  // empty — never overwrites a resumed draft or the user's in-progress edits.
  useEffect(() => {
    if (!draftLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/employer/profile-snapshot');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.found || !data.profile) return;

        const current = getValues();
        const fill = (field: keyof JobPostingFormData, value: string | undefined) => {
          if (value && !current[field]) {
            setValue(field, value as never, { shouldDirty: false, shouldValidate: false });
          }
        };

        fill('companyName', data.profile.companyName);
        fill('companyWebsite', data.profile.companyWebsite);

        if (data.profile.companyLogoUrl && !current.companyLogoUrl) {
          setValue('companyLogoUrl', data.profile.companyLogoUrl, { shouldDirty: false });
          setLogoPreview(data.profile.companyLogoUrl);
        }
      } catch { /* silent — pre-fill is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [draftLoaded, getValues, setValue]);

  const quillModules = useMemo(() => ({
    toolbar: [
      [{ 'header': [2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link'],
      ['clean'],
    ],
  }), []);

  const quillFormats = useMemo(() => [
    'header', 'bold', 'italic', 'underline', 'list', 'link',
  ], []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return; }
    if (!file.type.startsWith('image/')) { alert('Please upload an image file'); return; }
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/company-logo', { method: 'POST', body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Upload failed'); }
      const { url } = await res.json();
      setValue('companyLogoUrl', url);
      setLogoPreview(url);
    } catch (err) {
      console.error('Logo upload failed:', err);
      setLogoPreview(URL.createObjectURL(file));
    } finally {
      setUploadingLogo(false);
    }
  };

  const onSubmit = async (data: JobPostingFormData) => {
    localStorage.setItem('jobFormData', JSON.stringify(data));
    router.push('/post-job/preview');
  };

  const handleSaveDraft = async () => {
    if (!contactEmail || contactEmail.trim() === '') {
      setDraftSaveMessage('Please enter your email address first');
      setTimeout(() => setDraftSaveMessage(null), 3000);
      return;
    }
    setSavingDraft(true);
    setDraftSaveMessage(null);
    try {
      const formData = watch();
      const response = await fetch('/api/job-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contactEmail, formData }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setDraftSaveMessage('Draft saved! Check your email to continue later.');
      } else {
        setDraftSaveMessage(result.error || 'Failed to save draft');
      }
    } catch (err) {
      console.error('Error saving draft:', err);
      setDraftSaveMessage('Failed to save draft. Please try again.');
    } finally {
      setSavingDraft(false);
      setTimeout(() => setDraftSaveMessage(null), 5000);
    }
  };

  const handleClearDraft = () => {
    if (!window.confirm('Are you sure you want to clear this draft? All entered data will be lost.')) return;
    localStorage.removeItem('jobFormData');
    const url = new URL(window.location.href);
    url.searchParams.delete('resume');
    window.history.replaceState({}, '', url.toString());
    window.location.reload();
  };

  const handleCompetitiveChange = (checked: boolean) => {
    setSalaryCompetitive(checked);
    setValue('salaryCompetitive', checked);
    if (checked) { setValue('salaryMin', null); setValue('salaryMax', null); }
  };

  // Per-step validation
  const validateCurrentStep = async (): Promise<boolean> => {
    const stepFields = STEPS[currentStep - 1].fields as (keyof JobPostingFormData)[];
    // For step 4, skip salary validation if competitive is checked
    if (currentStep === 4 && salaryCompetitive) {
      const fieldsToValidate = stepFields.filter(f => !['salaryMin', 'salaryMax', 'salaryPeriod'].includes(f));
      if (fieldsToValidate.length === 0) return true;
      return await trigger(fieldsToValidate);
    }
    // For step 4, also skip applyUrl if using platform apply
    if (currentStep === 4 && watch('applyOnPlatform')) {
      const fieldsToValidate = stepFields.filter(f => f !== 'applyUrl');
      if (fieldsToValidate.length === 0) return true;
      return await trigger(fieldsToValidate);
    }
    const result = await trigger(stepFields);
    return result;
  };

  const handleNext = async () => {
    const isValid = await validateCurrentStep();
    if (isValid) {
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      if (currentStep < 5) {
        setCurrentStep(currentStep + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStepClick = (step: number) => {
    if (step <= currentStep || completedSteps.has(step)) {
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (isAuthLoading) return <LoadingFallback />;

  // Not Logged In
  if (!user) {
    return (
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 16px' }}>
        <div style={{ ...cardBase, padding: '40px 32px', textAlign: 'center' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '18px', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(145deg, #0D9488, #10B981)',
            boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.2)',
          }}>
            <Building2 size={24} color="#fff" />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 8px' }}>
            Post a Job
          </h2>
          <p style={{ fontSize: '14px', color: '#6B7F8A', margin: '0 0 28px', lineHeight: 1.5 }}>
            You must be logged in as an employer to post jobs. Create an account to manage listings and track applicants.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a href="/signup?role=employer" style={{
              ...clayBtn, justifyContent: 'center',
              background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
              boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
            }}>
              Sign Up as Employer
            </a>
            <a href="/login?next=/post-job" style={{
              ...clayBtn, justifyContent: 'center', background: '#F5F6F8', color: '#6B7F8A',
            }}>
              Log In
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Allowlist gate: only employers and admins reach the form. Everyone else
  // (job seekers, accounts with missing/unknown role) gets the wrong-account
  // screen — the API also enforces this, but blocking at the page level
  // prevents wasted form-fill effort and confusing 403s on submit.
  if (userRole !== 'employer' && userRole !== 'admin') {
    const roleLabel = userRole === 'job_seeker'
      ? 'Job Seeker'
      : userRole
        ? `${userRole.charAt(0).toUpperCase()}${userRole.slice(1)}`
        : 'unknown';
    return (
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 16px' }}>
        <div style={{ ...cardBase, padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 8px' }}>
            Wrong Account Type
          </h2>
          <p style={{ fontSize: '14px', color: '#6B7F8A', margin: '0 0 20px', lineHeight: 1.5 }}>
            You are logged in as <strong>{roleLabel}</strong>. Posting a job requires an Employer account.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a href="/jobs" style={{ ...clayBtn, justifyContent: 'center', background: '#F0FDFA', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
              Browse jobs instead
            </a>
            <button
              type="button"
              onClick={async () => {
                const { createClient } = await import('@/lib/supabase/client');
                const supabase = createClient();
                await supabase.auth.signOut();
                router.refresh();
                router.push('/signup?role=employer');
              }}
              style={{ ...clayBtn, width: '100%', justifyContent: 'center', background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
            >
              Sign out and create an Employer account
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══ Label Helper ═══ */
  const Label = ({ children, required, htmlFor }: { children: React.ReactNode; required?: boolean; htmlFor?: string }) => (
    <label htmlFor={htmlFor} style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '8px' }}>
      {children} {required && <span style={{ color: '#EF4444' }}>*</span>}
    </label>
  );

  const ErrorMsg = ({ message }: { message?: string }) =>
    message ? <p style={{ marginTop: '6px', fontSize: '12px', fontWeight: 500, color: '#EF4444' }}>{message}</p> : null;

  const InfoBox = ({ emoji, children, color = 'blue' }: { emoji: string; children: React.ReactNode; color?: string }) => {
    const colors = {
      blue: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
      amber: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
      teal: { bg: '#F0FDFA', border: '#99F6E4', text: '#115E59' },
    };
    const c = colors[color as keyof typeof colors] || colors.blue;
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '12px',
        padding: '12px 14px', borderRadius: '14px',
        background: c.bg, border: `1px solid ${c.border}`,
      }}>
        <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '1px' }}>{emoji}</span>
        <p style={{ fontSize: '13px', color: c.text, margin: 0, lineHeight: 1.5 }}>{children}</p>
      </div>
    );
  };

  return (
    <>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px 16px 120px' }}>

        {/* Draft Messages */}
        {draftLoaded && !draftSaveMessage && (
          <div style={{
            ...cardBase, padding: '12px 16px', marginBottom: '16px',
            background: '#F0FDFA', border: '1px solid #99F6E4',
          }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', margin: 0 }}>
              ✓ Welcome back! Your draft has been loaded.
            </p>
          </div>
        )}
        {draftSaveMessage && (
          <div style={{
            ...cardBase, padding: '12px 16px', marginBottom: '16px',
            background: draftSaveMessage.includes('saved') ? '#F0FDFA' : '#FEF2F2',
            border: `1px solid ${draftSaveMessage.includes('saved') ? '#99F6E4' : '#FECACA'}`,
          }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: draftSaveMessage.includes('saved') ? '#059669' : '#DC2626', margin: 0 }}>
              {draftSaveMessage}
            </p>
          </div>
        )}

        {/* Progress Bar */}
        <StepProgressBar
          currentStep={currentStep}
          onStepClick={handleStepClick}
          completedSteps={completedSteps}
        />

        <form id="job-post-form" onSubmit={handleSubmit(onSubmit)}>

          {/* ═══ STEP 1: Company Info ═══ */}
          {currentStep === 1 && (
            <div style={{ ...cardBase, padding: '28px 24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                Company Information
              </h2>
              <p style={{ fontSize: '13px', color: '#8A9BA6', margin: '0 0 24px' }}>Tell us about your organization and the role</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Job Title */}
                <div>
                  <Label required htmlFor="title">Job Title</Label>
                  <input type="text" id="title" placeholder="e.g. Remote PMHNP - Telepsychiatry"
                    {...register('title')}
                    style={errors.title ? clayInputError : clayInput}
                  />
                  <ErrorMsg message={errors.title?.message} />
                </div>

                {/* Company Name */}
                <div>
                  <Label required htmlFor="companyName">Company Name</Label>
                  <input type="text" id="companyName" placeholder="e.g. Mindful Health Partners"
                    {...register('companyName')}
                    style={errors.companyName ? clayInputError : clayInput}
                  />
                  <ErrorMsg message={errors.companyName?.message} />
                </div>

                {/* Company Website */}
                <div>
                  <Label htmlFor="companyWebsite">Company Website</Label>
                  <input type="url" id="companyWebsite" placeholder="https://www.example.com"
                    {...register('companyWebsite')}
                    style={errors.companyWebsite ? clayInputError : clayInput}
                  />
                  <ErrorMsg message={errors.companyWebsite?.message} />
                </div>

                {/* Contact Email */}
                <div>
                  <Label required htmlFor="contactEmail">Contact Email</Label>
                  <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '-4px 0 8px' }}>
                    Use your company email (not Gmail/Yahoo) to verify your identity
                  </p>
                  <input type="email" id="contactEmail" placeholder="hiring@yourcompany.com"
                    {...register('contactEmail')}
                    style={errors.contactEmail ? clayInputError : clayInput}
                  />
                  <ErrorMsg message={errors.contactEmail?.message} />
                </div>

                {/* Company Logo */}
                <div>
                  <Label>Company Logo</Label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {logoPreview && (
                      <img src={logoPreview} alt="Logo" style={{
                        width: '52px', height: '52px', borderRadius: '14px', objectFit: 'cover',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '2px 2px 6px rgba(0,0,0,0.06)',
                      }} />
                    )}
                    <label style={{ ...clayBtn, background: '#F5F6F8', color: '#6B7F8A', padding: '10px 16px', fontSize: '13px' }}>
                      <Upload size={14} />
                      {uploadingLogo ? 'Uploading...' : logoPreview ? 'Change Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} disabled={uploadingLogo} />
                    </label>
                    <span style={{ fontSize: '11px', color: '#B0BEC5' }}>PNG or JPG, max 2MB</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Role Details ═══ */}
          {currentStep === 2 && (
            <div style={{ ...cardBase, padding: '28px 24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                Role Details
              </h2>
              <p style={{ fontSize: '13px', color: '#8A9BA6', margin: '0 0 24px' }}>Where and how will this person work?</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Location */}
                <div>
                  <Label required htmlFor="location">Location</Label>
                  <input type="text" id="location" placeholder="e.g. Remote, New York NY"
                    {...register('location')}
                    style={errors.location ? clayInputError : clayInput}
                  />
                  <ErrorMsg message={errors.location?.message} />
                </div>

                {/* Work Mode */}
                <div>
                  <Label required>Work Mode</Label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {workModes.map((mode) => (
                      <label key={mode} style={{ cursor: 'pointer' }}>
                        <input type="radio" value={mode} {...register('mode')} style={{ display: 'none' }} />
                        <div style={watch('mode') === mode ? clayPillActive : clayPill}>
                          {mode}
                        </div>
                      </label>
                    ))}
                  </div>
                  <ErrorMsg message={errors.mode?.message} />
                </div>

                {/* Job Type */}
                <div>
                  <Label required>Job Type</Label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {jobTypes.map((type) => (
                      <label key={type} style={{ cursor: 'pointer' }}>
                        <input type="radio" value={type} {...register('jobType')} style={{ display: 'none' }} />
                        <div style={watch('jobType') === type ? clayPillActive : clayPill}>
                          {type}
                        </div>
                      </label>
                    ))}
                  </div>
                  <ErrorMsg message={errors.jobType?.message} />
                </div>

                {/* Clinical Setting */}
                <div>
                  <Label htmlFor="setting">Clinical Setting <span style={{ fontWeight: 400, color: '#B0BEC5' }}>(optional)</span></Label>
                  <select id="setting" {...register('setting')} style={clayInput} defaultValue="">
                    <option value="">Select a setting...</option>
                    {SETTING_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Patient Population */}
                <div>
                  <Label htmlFor="population">Patient Population <span style={{ fontWeight: 400, color: '#B0BEC5' }}>(optional)</span></Label>
                  <select id="population" {...register('population')} style={clayInput} defaultValue="">
                    <option value="">Select a population...</option>
                    {POPULATION_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Job Description ═══ */}
          {currentStep === 3 && (
            <div style={{ ...cardBase, padding: '28px 24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                Job Description
              </h2>
              <p style={{ fontSize: '13px', color: '#8A9BA6', margin: '0 0 24px' }}>Describe the role, responsibilities, and requirements</p>

              <div>
                <Label required>Description</Label>
                <div style={{
                  borderRadius: '14px', overflow: 'hidden',
                  border: errors.description ? '1.5px solid #EF4444' : '1px solid rgba(0,0,0,0.08)',
                  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.03)',
                }}>
                  <style>{`.ql-editor { min-height: 350px !important; font-size: 14px; } .ql-toolbar { border: none !important; border-bottom: 1px solid rgba(0,0,0,0.06) !important; background: #F5F6F8; } .ql-container { border: none !important; }`}</style>
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
                </div>
                <ErrorMsg message={errors.description?.message} />
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#B0BEC5', margin: 0 }}>Minimum 200 characters. Use the toolbar to format.</p>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: (watch('description') || '').replace(/<[^>]*>/g, '').length > 5000 ? '#EF4444' : '#94A3B8' }}>
                    {(watch('description') || '').replace(/<[^>]*>/g, '').length.toLocaleString()} / 5,000
                  </span>
                </div>
                <InfoBox emoji="💡" color="blue">
                  <strong>Writing tip:</strong> Include sections for <em>About the Role</em>, <em>Responsibilities</em>, <em>Requirements</em>, and <em>Why Join Us</em> to attract top PMHNP talent.
                </InfoBox>
              </div>
            </div>
          )}

          {/* ═══ STEP 4: Compensation & Apply ═══ */}
          {currentStep === 4 && (
            <div style={{ ...cardBase, padding: '28px 24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                Compensation & Application
              </h2>
              <p style={{ fontSize: '13px', color: '#8A9BA6', margin: '0 0 24px' }}>Set salary, benefits, and how candidates should apply</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Salary */}
                <div>
                  <Label required={!salaryCompetitive}>Salary Range</Label>

                  {/* Pay Period Pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {salaryPeriods.map((period) => (
                      <label key={period.value} style={{ cursor: salaryCompetitive ? 'not-allowed' : 'pointer', opacity: salaryCompetitive ? 0.5 : 1 }}>
                        <input type="radio" value={period.value} disabled={salaryCompetitive} {...register('salaryPeriod')} style={{ display: 'none' }} />
                        <div style={!salaryCompetitive && salaryPeriod === period.value ? clayPillActive : { ...clayPill, padding: '8px 16px', fontSize: '13px' }}>
                          {period.label}
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Min / Max */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <input type="number" inputMode="numeric" placeholder={`Min ${salaryPeriod === 'hourly' ? '$/hr' : '$ ' + (salaryPeriod || 'annual')}`}
                        disabled={salaryCompetitive} {...register('salaryMin', { valueAsNumber: true })}
                        style={{ ...(salaryCompetitive ? { ...clayInput, opacity: 0.5, cursor: 'not-allowed' } : errors.salaryMin ? clayInputError : clayInput) }}
                      />
                      <ErrorMsg message={errors.salaryMin?.message} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input type="number" inputMode="numeric" placeholder={`Max ${salaryPeriod === 'hourly' ? '$/hr' : '$ ' + (salaryPeriod || 'annual')}`}
                        disabled={salaryCompetitive} {...register('salaryMax', { valueAsNumber: true })}
                        style={{ ...(salaryCompetitive ? { ...clayInput, opacity: 0.5, cursor: 'not-allowed' } : errors.salaryMax ? clayInputError : clayInput) }}
                      />
                      <ErrorMsg message={errors.salaryMax?.message} />
                    </div>
                  </div>
                  <ErrorMsg message={!salaryCompetitive ? errors.salaryPeriod?.message : undefined} />

                  {/* Competitive checkbox */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '4px 0' }}>
                    <input type="checkbox" checked={salaryCompetitive} onChange={(e) => handleCompetitiveChange(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#0D9488', borderRadius: '4px' }}
                    />
                    <span style={{ fontSize: '13px', color: '#6B7F8A' }}>Competitive salary (don&apos;t display range)</span>
                  </label>

                  {salaryCompetitive && (
                    <InfoBox emoji="💡" color="amber">
                      <strong>Pro tip:</strong> Job posts with a visible salary range get <strong>3× more views</strong> and <strong>2× more applications</strong>.
                    </InfoBox>
                  )}
                </div>

                {/* Benefits */}
                <div>
                  <Label>Benefits & Perks</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                    {BENEFIT_OPTIONS.map((benefit) => {
                      const selected = watch('benefits')?.includes(benefit);
                      return (
                        <label key={benefit} style={{ cursor: 'pointer' }}>
                          <input type="checkbox" value={benefit} {...register('benefits')} style={{ display: 'none' }} />
                          <div style={{
                            ...clayPill, padding: '8px 12px', fontSize: '12px', justifyContent: 'flex-start', gap: '6px',
                            ...(selected ? { background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0', boxShadow: '2px 2px 5px rgba(5,150,105,0.08), inset 1px 1px 2px rgba(255,255,255,0.5)' } : {}),
                          }}>
                            {selected ? '✓' : '+'} {benefit}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Apply Method */}
                <div>
                  <Label required>How should candidates apply?</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* External */}
                    <label style={{
                      ...cardBase, padding: '14px 16px', cursor: 'pointer',
                      border: !watch('applyOnPlatform') ? '2px solid #0D9488' : '1px solid rgba(0,0,0,0.06)',
                      background: !watch('applyOnPlatform') ? '#F0FDFA' : '#fff',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <input type="radio" checked={!watch('applyOnPlatform')} onChange={() => setValue('applyOnPlatform', false)}
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
                      border: watch('applyOnPlatform') ? '2px solid #0D9488' : '1px solid rgba(0,0,0,0.06)',
                      background: watch('applyOnPlatform') ? '#F0FDFA' : '#fff',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <input type="radio" checked={watch('applyOnPlatform') === true}
                          onChange={() => { setValue('applyOnPlatform', true); setValue('applyUrl', ''); }}
                          style={{ marginTop: '3px', accentColor: '#0D9488', width: '16px', height: '16px' }}
                        />
                        <div>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35' }}>Receive on PMHNP Hiring</span>
                          <p style={{ fontSize: '12px', color: '#8A9BA6', margin: '2px 0 0' }}>Candidates apply directly — no website needed</p>
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
                  {!watch('applyOnPlatform') && (
                    <div style={{ marginTop: '12px' }}>
                      <Label required htmlFor="applyUrl">Application URL</Label>
                      <input type="url" id="applyUrl" placeholder="https://www.example.com/careers/apply"
                        {...register('applyUrl')}
                        style={errors.applyUrl ? clayInputError : clayInput}
                      />
                      <ErrorMsg message={errors.applyUrl?.message} />
                      <InfoBox emoji="💡" color="amber">
                        This should be a direct link to your application page — <strong>not your company homepage</strong>.
                      </InfoBox>
                    </div>
                  )}

                  {/* Platform info */}
                  {watch('applyOnPlatform') && (
                    <>
                      <InfoBox emoji="✅" color="teal">
                        <strong>Great choice!</strong> You&apos;ll receive email notifications for each new application and manage all applicants from your dashboard.
                      </InfoBox>
                      <div style={{ marginTop: '16px' }}>
                        <ScreeningQuestionsBuilder />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 5: Review Features ═══ */}
          {currentStep === 5 && (
            <div style={{ ...cardBase, padding: '28px 24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                Your Posting Includes
              </h2>
              <p style={{ fontSize: '13px', color: '#8A9BA6', margin: '0 0 24px' }}>Every job post gets the full package — free or paid</p>

              <div style={{
                ...cardBase, padding: '20px',
                background: '#F0FDFA', border: '1px solid #99F6E4',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(145deg, #0D9488, #10B981)',
                    boxShadow: '3px 3px 8px rgba(13,148,136,0.2)',
                  }}>
                    <Check size={18} color="#fff" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>Full Package — Every Post</h3>
                    <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '2px 0 0' }}>First 2 posts free, then ${config.postingPrice}/post</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[`${config.durationDays}-day paid · ${config.freeDurationDays}-day free`, 'Featured badge', 'Top placement', 'Email alerts', `${config.limits.candidateUnlocksPerPosting} candidate unlocks`, `${config.limits.inmailsPerPosting} InMails`, 'Analytics'].map(f => (
                    <span key={f} style={{
                      fontSize: '11px', fontWeight: 500, padding: '4px 10px',
                      borderRadius: '10px', background: '#CCFBF1', color: '#0D9488',
                    }}>✓ {f}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </form>

        {/* ═══ Navigation Buttons ═══ */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '20px', gap: '12px', flexWrap: 'wrap',
        }}>
          {/* Left: Back + Draft Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 1 && (
              <button type="button" onClick={handleBack} className="wizard-nav-btn" style={{
                ...clayBtn, background: '#F5F6F8', color: '#6B7F8A', padding: '10px 18px', fontSize: '13px',
              }}>
                <ChevronLeft size={14} /> Back
              </button>
            )}
            <button type="button" onClick={handleSaveDraft} disabled={savingDraft} className="wizard-nav-btn" style={{
              ...clayBtn, background: '#fff', color: '#8A9BA6', padding: '10px 14px', fontSize: '12px',
            }}>
              {savingDraft ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {savingDraft ? 'Saving...' : 'Save Draft'}
            </button>
            <button type="button" onClick={handleClearDraft} className="wizard-nav-btn" style={{
              ...clayBtn, background: '#fff', color: '#B0BEC5', padding: '10px 14px', fontSize: '12px',
            }}>
              <Trash2 size={13} /> Clear
            </button>
          </div>

          {/* Right: Continue / Submit */}
          {currentStep < 5 ? (
            <button type="button" onClick={handleNext} className="wizard-next-btn" style={{
              ...clayBtn,
              background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
              padding: '12px 28px', fontSize: '14px',
              boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
            }}>
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button type="submit" form="job-post-form" disabled={isSubmitting} className="wizard-next-btn" style={{
              ...clayBtn,
              background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
              padding: '12px 28px', fontSize: '14px',
              boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
              opacity: isSubmitting ? 0.6 : 1,
            }}>
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Processing...</>
              ) : (
                <>Continue to Preview <ChevronRight size={16} /></>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Hover Styles */}
      <style>{`
        .wizard-nav-btn:hover { transform: translateY(-1px); }
        .wizard-next-btn:hover { transform: translateY(-1px); box-shadow: 6px 6px 16px rgba(13,148,136,0.3), inset 1px 1px 2px rgba(255,255,255,0.15) !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}


export default function PostJobPage() {
  return (
    <>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Post a Job', url: 'https://pmhnphiring.com/post-job' },
      ]} />
      <Suspense fallback={<LoadingFallback />}>
        <PostJobContent />
      </Suspense>
    </>
  );
}
