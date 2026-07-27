'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  Loader2,
  LogIn,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';

const LOGIN_HREF = '/login?redirectTo=/tools/resume-checker';

/**
 * Contract mirror of POST /api/resume-studio/score-upload (owned by the
 * server route). Keep this shape in sync with the route's response type.
 */
export interface ResumeScoreDimension {
  key: string;
  label: string;
  score: number;
  max: number;
  findings: string[];
}

export type ResumeScoreGrade = 'strong' | 'solid' | 'needs-work' | 'critical';

export interface ResumeScoreResult {
  total: number;
  grade: ResumeScoreGrade;
  dimensions: ResumeScoreDimension[];
}

const SCORE_ENDPOINT = '/api/resume-studio/score-upload';
const MAX_FILE_MB = 5;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;

const GRADE_META: Record<
  ResumeScoreGrade,
  { label: string; color: string; background: string }
> = {
  strong: { label: 'Strong', color: '#0D9488', background: '#F0FDFA' },
  solid: { label: 'Solid', color: '#D97706', background: '#FFFBEB' },
  'needs-work': { label: 'Needs work', color: '#EA580C', background: '#FFF7ED' },
  critical: { label: 'Critical', color: '#DC2626', background: '#FEF2F2' },
};

const card: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

type Status = 'idle' | 'uploading' | 'done' | 'error';

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!hasAcceptedExtension) {
    return 'That file type is not supported. Please upload a PDF, DOC, or DOCX file.';
  }
  if (file.size === 0) {
    return 'That file looks empty. Please choose a different copy of your resume.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return `That file is larger than ${MAX_FILE_MB}MB. Please export a smaller copy and try again.`;
  }
  return null;
}

/** Pull a human message out of an error body without trusting its shape. */
function readMessage(body: unknown, key: 'error' | 'message'): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isScoreResult(value: unknown): value is ResumeScoreResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ResumeScoreResult>;
  return (
    typeof candidate.total === 'number' &&
    typeof candidate.grade === 'string' &&
    candidate.grade in GRADE_META &&
    Array.isArray(candidate.dimensions) &&
    candidate.dimensions.every(
      (dimension) =>
        dimension !== null &&
        typeof dimension === 'object' &&
        typeof dimension.label === 'string' &&
        typeof dimension.score === 'number' &&
        typeof dimension.max === 'number' &&
        Array.isArray(dimension.findings)
    )
  );
}

function barColor(ratio: number): string {
  if (ratio >= 0.75) return '#0D9488';
  if (ratio >= 0.5) return '#D97706';
  if (ratio >= 0.25) return '#EA580C';
  return '#DC2626';
}

interface ResumeCheckerUploadProps {
  /** Anonymous visitors can read the page but must sign in to run a check,
   *  keeping resume tooling tied to an account (AI features share this gate). */
  isAuthenticated: boolean;
}

export default function ResumeCheckerUpload({ isAuthenticated }: ResumeCheckerUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeScoreResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const scoreFile = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setResult(null);
      setError(validationError);
      setStatus('error');
      return;
    }

    setFileName(file.name);
    setResult(null);
    setError(null);
    setStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(SCORE_ENDPOINT, { method: 'POST', body: formData });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        // Session lapsed between page load and submit — fall back to the gate.
        setSessionExpired(true);
        setStatus('idle');
        return;
      }

      if (response.status === 429) {
        setError(
          readMessage(body, 'message') ??
            readMessage(body, 'error') ??
            'You have checked several resumes in a short window. Please wait a few minutes and try again.'
        );
        setStatus('error');
        return;
      }

      if (!response.ok) {
        setError(
          readMessage(body, 'error') ??
            'Something went wrong while scoring your resume. Please try again.'
        );
        setStatus('error');
        return;
      }

      const score =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>).score
          : undefined;
      if (!isScoreResult(score)) {
        setError('We could not read the score response. Please try again.');
        setStatus('error');
        return;
      }

      setResult(score);
      setStatus('done');
    } catch {
      setError(
        'We could not reach the scoring service. Please check your connection and try again.'
      );
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      if (status === 'uploading') return;
      const file = event.dataTransfer.files?.[0];
      if (file) void scoreFile(file);
    },
    [scoreFile, status]
  );

  const gradeMeta = result ? GRADE_META[result.grade] : null;

  // Login gate: the page is fully readable by anyone, but running a check
  // requires an account so resume tooling and its AI features stay tied to a
  // signed-in user. Anonymous visitors see this in place of the upload zone.
  if (!isAuthenticated || sessionExpired) {
    return (
      <div style={{ ...card, padding: '24px' }}>
        <div
          className="rounded-2xl px-6 py-10 text-center"
          style={{ border: '2px dashed #D6D3D1', background: '#FAFAF9' }}
        >
          <div
            className="inline-flex items-center justify-center rounded-2xl p-3"
            style={{ background: '#F0FDFA', color: '#0D9488' }}
          >
            <LogIn className="w-6 h-6" aria-hidden="true" />
          </div>
          <p className="mt-3 font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
            {sessionExpired ? 'Please sign in again to check your resume' : 'Sign in to check your resume'}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
            The checker is free. Signing in keeps your checks and AI resume tools tied to your
            account.
          </p>
          <a
            href={LOGIN_HREF}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            style={{ background: '#0D9488' }}
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            Sign in or create an account
          </a>
        </div>
        <p
          className="mt-3 text-xs flex items-center gap-1.5"
          style={{ color: 'var(--text-tertiary, #6B7280)' }}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
          Your file is scored in memory and never stored, and checks never count against any daily
          AI limits.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Upload zone */}
      <div
        style={{ ...card, padding: '24px' }}
        onDragOver={(event) => {
          event.preventDefault();
          if (status !== 'uploading') setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <div
          className="rounded-2xl px-6 py-10 text-center transition-colors"
          style={{
            border: `2px dashed ${isDragOver ? '#0D9488' : '#D6D3D1'}`,
            background: isDragOver ? '#F0FDFA' : '#FAFAF9',
          }}
        >
          {status === 'uploading' ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2
                className="w-8 h-8 animate-spin"
                style={{ color: '#0D9488' }}
                aria-hidden="true"
              />
              <p className="font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
                Scoring {fileName ?? 'your resume'} now.
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
                This usually takes a few seconds.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div
                className="inline-flex items-center justify-center rounded-2xl p-3"
                style={{ background: '#F0FDFA', color: '#0D9488' }}
              >
                <Upload className="w-6 h-6" aria-hidden="true" />
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
                Drag and drop your resume here
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
                PDF, DOC, or DOCX up to {MAX_FILE_MB}MB.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                style={{ background: '#0D9488' }}
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                Choose a file
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void scoreFile(file);
                }}
              />
            </div>
          )}
        </div>
        <p
          className="mt-3 text-xs flex items-center gap-1.5"
          style={{ color: 'var(--text-tertiary, #6B7280)' }}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
          Your file is scored in memory and never stored, and checks never count against any daily
          AI limits.
        </p>
      </div>

      {/* The aria-live region is mounted from the FIRST render, before any
          content appears inside it, so screen readers announce the first
          result and every error; content swaps inside the region. */}
      <div aria-live="polite">
        {status === 'uploading' && <p className="sr-only">Scoring your resume now.</p>}

        {status === 'error' && error && (
          <div style={{ ...card, padding: '24px', marginTop: '20px' }}>
            <p className="font-semibold" style={{ color: '#DC2626' }}>
              {error}
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ color: '#0D9488', border: '1px solid #0D9488' }}
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}

        {status === 'done' && result && gradeMeta && (
          <div style={{ ...card, padding: '28px', marginTop: '20px' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
              >
                Your resume score
              </h2>
              {fileName && (
                <span className="text-xs" style={{ color: 'var(--text-tertiary, #6B7280)' }}>
                  {fileName}
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <span
                className="text-6xl font-extrabold leading-none"
                style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: gradeMeta.color }}
              >
                {Math.round(result.total)}
              </span>
              <div>
                <span
                  className="inline-flex rounded-full px-3 py-1 text-sm font-bold"
                  style={{ background: gradeMeta.background, color: gradeMeta.color }}
                >
                  {gradeMeta.label}
                </span>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
                  out of 100 on the PMHNP rubric
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              {result.dimensions.map((dimension, index) => {
                const ratio =
                  dimension.max > 0
                    ? Math.min(1, Math.max(0, dimension.score / dimension.max))
                    : 0;
                return (
                  <div key={dimension.key || `${dimension.label}-${index}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: 'var(--text-primary, #1F2937)' }}
                      >
                        {dimension.label}
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: 'var(--text-tertiary, #6B7280)' }}
                      >
                        {dimension.score} of {dimension.max}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-2 rounded-full"
                      style={{ background: '#E7E5E4' }}
                      role="img"
                      aria-label={`${dimension.label}: ${dimension.score} of ${dimension.max}`}
                    >
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${ratio * 100}%`, background: barColor(ratio) }}
                      />
                    </div>
                    {dimension.findings.length > 0 && (
                      <ul className="mt-2 space-y-1 list-disc pl-5">
                        {dimension.findings.map((finding, findingIndex) => (
                          <li
                            key={findingIndex}
                            className="text-sm"
                            style={{ color: 'var(--text-secondary, #4B5563)' }}
                          >
                            {finding}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl p-5" style={{ background: '#F0FDFA' }}>
              <p className="text-sm font-semibold" style={{ color: '#1A2E35' }}>
                Want to act on these findings?
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
                The free resume studio saves this resume, builds separate versions for different
                roles, and runs a deeper AI review with specific rewrite suggestions.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/resume-studio"
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                  style={{ background: '#0D9488' }}
                >
                  Open the resume studio
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={{ color: '#0D9488', border: '1px solid #0D9488' }}
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Check another resume
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
