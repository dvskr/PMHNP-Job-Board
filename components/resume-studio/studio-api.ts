/**
 * Typed fetch client for the Resume Studio API.
 *
 * The backend routes are built separately; every type here is written from the
 * fixed API contract, not imported from server modules, so this file stays
 * safe to bundle into client components.
 *
 * The one exception is lib/resume-studio/templates.ts: it is a pure data
 * registry with no server imports, and it is the single source of truth that
 * the live preview and the PDF export both read. Presentation ids are taken
 * from there rather than re-declared here, so the client cannot drift from
 * what the API accepts.
 */

import type { ResumeStyleConfig, ResumeTemplateId } from '@/lib/resume-studio/templates';

export type { ResumeStyleConfig, ResumeTemplateId };

// ─── Section shapes ──────────────────────────────────────────────────────────

export interface ResumeContact {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  linkedinUrl: string;
}

export interface ResumeLicense {
  licenseType: string;
  licenseState: string;
  licenseNumber: string;
  expiration: string;
}

export interface ResumeCertification {
  name: string;
  certifyingBody: string;
  expiration: string;
}

export interface ResumeEducation {
  degreeType: string;
  fieldOfStudy: string;
  schoolName: string;
  graduationYear: string;
}

export interface ResumeExperience {
  jobTitle: string;
  employerName: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  bullets: string[];
}

export interface ResumeSections {
  contact: ResumeContact;
  summary: string;
  licenses: ResumeLicense[];
  certifications: ResumeCertification[];
  education: ResumeEducation[];
  experience: ResumeExperience[];
  skills: string[];
}

// ─── Documents ───────────────────────────────────────────────────────────────

/**
 * What a stored document can carry. The API only accepts the five registry ids
 * on write, but rows created before the registry existed may still hold the
 * retired 'compact' id, so reads stay wide. getTemplate() falls back to
 * 'classic' for anything it does not recognize, so those rows keep rendering.
 */
export type ResumeTemplate = ResumeTemplateId | 'compact';

export interface ResumeDocumentSummary {
  id: string;
  title: string;
  template: ResumeTemplate;
  isDefault: boolean;
  updatedAt: string;
}

export interface ResumeDocument extends ResumeDocumentSummary {
  sections: ResumeSections;
  /**
   * Presentation options (font, density, paper). Null on documents saved
   * before the style controls shipped. Always read it through
   * resolveResumeStyle(), which normalizes null and unknown ids.
   */
  styleConfig?: ResumeStyleConfig | null;
}

export interface DocumentPatch {
  title?: string;
  /** Send a ResumeTemplateId; the API rejects the retired 'compact' id. */
  template?: ResumeTemplate;
  sections?: ResumeSections;
  isDefault?: boolean;
  /** Partial patches are merged and normalized server side. */
  styleConfig?: Partial<ResumeStyleConfig>;
}

// ─── Score ───────────────────────────────────────────────────────────────────

export type ResumeGrade = 'strong' | 'solid' | 'needs-work' | 'critical';

export interface ScoreDimension {
  key: string;
  label: string;
  score: number;
  max: number;
  findings: string[];
}

export interface ResumeScoreResult {
  total: number;
  grade: ResumeGrade;
  dimensions: ScoreDimension[];
}

// ─── AI review ───────────────────────────────────────────────────────────────

export interface ReviewGap {
  area: string;
  why: string;
  fix: string;
}

export interface RewrittenBullet {
  original: string;
  improved: string;
  rationale: string;
}

export interface SectionNote {
  section: string;
  note: string;
}

export interface ResumeReview {
  overallAssessment: string;
  strengths: string[];
  gaps: ReviewGap[];
  rewrittenBullets: RewrittenBullet[];
  sectionNotes: SectionNote[];
  atsTips: string[];
}

// ─── Tailoring ───────────────────────────────────────────────────────────────

export interface KeywordAlignment {
  keyword: string;
  presentInResume: boolean;
  suggestion: string;
}

export interface TailoredBullet {
  original: string;
  tailored: string;
  rationale: string;
}

export interface GapToAddress {
  gap: string;
  mitigation: string;
}

export interface ResumeTailoring {
  fitSummary: string;
  keywordAlignment: KeywordAlignment[];
  tailoredSummary: string;
  tailoredBullets: TailoredBullet[];
  gapsToAddress: GapToAddress[];
}

// ─── Cover letter ────────────────────────────────────────────────────────────

export type CoverLetterTone = 'professional' | 'warm' | 'direct';

// ─── Usage / quotas ──────────────────────────────────────────────────────────

export interface FeatureUsage {
  used: number;
  cap: number;
  remaining: number;
  resetAtIso: string;
}

export interface UsageSummary {
  resume_review: FeatureUsage;
  resume_tailoring: FeatureUsage;
  cover_letter: FeatureUsage;
}

// ─── Result envelope ─────────────────────────────────────────────────────────

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; message?: string; usage?: FeatureUsage };

function isFeatureUsage(value: unknown): value is FeatureUsage {
  if (typeof value !== 'object' || value === null) return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.used === 'number' &&
    typeof u.cap === 'number' &&
    typeof u.remaining === 'number' &&
    typeof u.resetAtIso === 'string'
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }

  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    return {
      ok: false,
      status: res.status,
      error: typeof err.error === 'string' ? err.error : `http_${res.status}`,
      message: typeof err.message === 'string' ? err.message : undefined,
      usage: isFeatureUsage(err.usage) ? err.usage : undefined,
    };
  }

  return { ok: true, data: body as T };
}

function jsonInit(method: 'POST' | 'PATCH', payload?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

const BASE = '/api/resume-studio';

export function listDocuments(): Promise<ApiResult<{ documents: ResumeDocumentSummary[] }>> {
  return request(`${BASE}/documents`);
}

export function createDocument(input: {
  title?: string;
  seedFromProfile?: boolean;
}): Promise<ApiResult<{ document: ResumeDocument }>> {
  return request(`${BASE}/documents`, jsonInit('POST', input));
}

export function getDocument(id: string): Promise<ApiResult<{ document: ResumeDocument }>> {
  return request(`${BASE}/documents/${encodeURIComponent(id)}`);
}

export function updateDocument(
  id: string,
  patch: DocumentPatch,
): Promise<ApiResult<{ document: ResumeDocument }>> {
  return request(`${BASE}/documents/${encodeURIComponent(id)}`, jsonInit('PATCH', patch));
}

export function deleteDocument(id: string): Promise<ApiResult<{ ok?: boolean }>> {
  return request(`${BASE}/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function duplicateDocument(id: string): Promise<ApiResult<{ document: ResumeDocument }>> {
  return request(`${BASE}/documents/${encodeURIComponent(id)}/duplicate`, jsonInit('POST'));
}

export function documentPdfUrl(id: string): string {
  return `${BASE}/documents/${encodeURIComponent(id)}/pdf`;
}

export function scoreDocument(
  documentId: string,
): Promise<ApiResult<{ score: ResumeScoreResult }>> {
  return request(`${BASE}/score`, jsonInit('POST', { documentId }));
}

export function reviewDocument(
  documentId: string,
): Promise<ApiResult<{ review: ResumeReview; usage?: FeatureUsage }>> {
  return request(`${BASE}/review`, jsonInit('POST', { documentId }));
}

export function tailorDocument(input: {
  documentId: string;
  jobText?: string;
  jobId?: string;
}): Promise<ApiResult<{ tailoring: ResumeTailoring; usage?: FeatureUsage }>> {
  return request(`${BASE}/tailor`, jsonInit('POST', input));
}

export function generateCoverLetter(input: {
  documentId: string;
  jobText?: string;
  jobId?: string;
  tone?: CoverLetterTone;
}): Promise<ApiResult<{ coverLetter: string; usage?: FeatureUsage }>> {
  return request(`${BASE}/cover-letter`, jsonInit('POST', input));
}

export function getUsage(): Promise<ApiResult<{ usage: UsageSummary }>> {
  return request(`${BASE}/usage`);
}
