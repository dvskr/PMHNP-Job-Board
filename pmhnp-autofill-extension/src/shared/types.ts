// ─── Profile Data Types ───
// Matches the exact response shape from GET /api/profile/export

export interface ProfileData {
    personal: PersonalInfo;
    eeo: EEOData;
    credentials: CredentialsData;
    malpractice: MalpracticeData;
    practiceAuthority: PracticeAuthorityData;
    education: EducationEntry[];
    workExperience: WorkExperienceEntry[];
    screeningAnswers: ScreeningAnswers;
    openEndedResponses: Record<string, OpenEndedResponse>;
    documents: DocumentEntry[];
    references: ReferenceEntry[];
    preferences: PreferencesData;
    meta: MetaData;
}

export interface PersonalInfo {
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    address: Address;
    linkedinUrl: string | null;
    avatarUrl: string | null;
    headline: string | null;
}

export interface Address {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
}

export interface EEOData {
    workAuthorized: boolean | null;
    requiresSponsorship: boolean | null;
    veteranStatus: string | null;
    disabilityStatus: string | null;
    raceEthnicity: string | null;
    gender: string | null;
}

export interface CredentialsData {
    licenses: License[];
    certifications: Certification[];
    npiNumber: string | null;
    deaNumber: string | null;
    deaExpirationDate: string | null;
    deaScheduleAuthority: string | null;
    stateControlledSubstanceReg: string | null;
    stateCSRExpirationDate: string | null;
    pmpRegistered: boolean | null;
}

export interface License {
    licenseType: string;
    licenseNumber: string;
    licenseState: string;
    expirationDate: string | null;
    status: string;
}

export interface Certification {
    certificationName: string;
    certifyingBody: string | null;
    certificationNumber: string | null;
    expirationDate: string | null;
}

export interface MalpracticeData {
    carrier: string | null;
    policyNumber: string | null;
    coverage: string | null;
    claimsHistory: boolean | null;
    claimsDetails: string | null;
}

export interface PracticeAuthorityData {
    fullPracticeAuthority: boolean | null;
    collaborativeAgreementReq: boolean | null;
    collaboratingPhysicianName: string | null;
    collaboratingPhysicianContact: string | null;
    prescriptiveAuthorityStatus: string | null;
}

export interface EducationEntry {
    degreeType: string;
    fieldOfStudy: string | null;
    schoolName: string;
    graduationDate: string | null;
    gpa: string | null;
    isHighestDegree: boolean;
}

export interface ClinicalDetails {
    patientVolume: string | null;
    patientPopulations: string[] | null;
    treatmentModalities: string[] | null;
    disordersTreated: string[] | null;
    practiceSetting: string | null;
    telehealthExperience: boolean | null;
    telehealthPlatforms: string[] | null;
    ehrSystems: string[] | null;
    prescribingExp: boolean | null;
    prescribingSchedules: string | null;
    assessmentTools: string[] | null;
    supervisoryRole: boolean | null;
    supervisoryDetails: string | null;
}

export interface WorkExperienceEntry {
    jobTitle: string;
    employerName: string;
    employerCity: string | null;
    employerState: string | null;
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    supervisorName: string | null;
    supervisorPhone: string | null;
    supervisorEmail: string | null;
    mayContact: boolean | null;
    reasonForLeaving: string | null;
    description: string | null;
    clinicalDetails: ClinicalDetails;
}

export interface ScreeningAnswerEntry {
    answer: boolean | null;
    details: string | null;
}

export interface ScreeningAnswers {
    background: Record<string, ScreeningAnswerEntry>;
    clinical: Record<string, ScreeningAnswerEntry>;
    logistics: Record<string, ScreeningAnswerEntry>;
}

export interface OpenEndedResponse {
    questionText: string;
    response: string;
    isAIGenerated: boolean;
}

export interface DocumentEntry {
    documentType: string;
    documentLabel: string;
    fileUrl: string;
    fileName: string;
    expirationDate: string | null;
}

export interface ReferenceEntry {
    fullName: string;
    title: string | null;
    organization: string | null;
    phone: string | null;
    email: string | null;
    relationship: string | null;
    yearsKnown: number | null;
}

export interface PreferencesData {
    preferredWorkMode: string | null;
    preferredJobType: string | null;
    desiredSalaryMin: number | null;
    desiredSalaryMax: number | null;
    desiredSalaryType: string | null;
    availableDate: string | null;
    openToOffers: boolean;
}

export interface MetaData {
    lastUpdated: string;
    resumeUrl: string | null;
}

// ─── Auth Types ───

export interface AuthState {
    isLoggedIn: boolean;
    user: AuthUser | null;
    token: string | null;
    expiresAt: string | null;
}

export interface AuthUser {
    userId: string;
    email: string;
    firstName: string;
}

export interface ExtensionTokenResponse {
    token: string;
    userId: string;
    email: string;
    firstName: string;
    expiresAt: string;
}

// ─── Form Detection Types ───

export interface DetectedField {
    element: HTMLElement;
    fieldType: 'input' | 'select' | 'textarea' | 'file' | 'radio' | 'checkbox';
    identifier: string;
    confidence: number;
    label: string;
    name: string;
    id: string;
    placeholder: string;
    ariaLabel: string;
    required: boolean;
    currentValue: string;
    options: string[];
    fieldCategory: FieldCategory;
    atsSpecific: boolean;
}

export type FieldCategory =
    | 'personal'
    | 'credential'
    | 'education'
    | 'experience'
    | 'screening'
    | 'document'
    | 'open_ended'
    | 'eeo'
    | 'unknown';

// ─── Field Mapping Types ───

export interface MappedField {
    field: DetectedField;
    profileKey: string;
    value: string | boolean;
    fillMethod: 'text' | 'select' | 'radio' | 'checkbox' | 'file' | 'date' | 'ai_generate';
    requiresAI: boolean;
    requiresFile: boolean;
    documentType: string | null;
    confidence: number;
    status: 'ready' | 'no_data' | 'needs_ai' | 'needs_file' | 'ambiguous' | 'needs_ai_classification';
}

// ─── Form Filling Types ───

export interface FillResult {
    total: number;
    filled: number;
    skipped: number;
    failed: number;
    needsAI: number;
    needsFile: number;
    details: FillDetail[];
}

export interface FillDetail {
    field: MappedField;
    status: 'filled' | 'skipped' | 'failed' | 'needs_review';
    error?: string;
}

// ─── ATS Handler Types ───

export interface ATSHandler {
    name: string;
    detect: () => boolean;
    detectFields: () => DetectedField[];
    fillField: (field: MappedField) => Promise<FillDetail>;
    handleDropdown: (element: HTMLElement, value: string) => Promise<boolean>;
    handleFileUpload: (element: HTMLElement, file: File) => Promise<boolean>;
    handleMultiStep?: () => { currentStep: number; totalSteps: number };
}

// ─── AI Types ───

export interface JobContext {
    jobTitle: string;
    employerName: string;
    jobDescription: string;
    pageUrl: string;
}

export interface AIGenerateRequest {
    questionText: string;
    questionKey?: string;
    jobTitle: string;
    jobDescription: string;
    employerName: string;
    maxLength?: number;
}

export interface AIGenerateResponse {
    answer: string;
    questionKey: string;
    model: string;
    basedOnStoredResponse: boolean;
}

export interface AIFillResult {
    total: number;
    generated: number;
    failed: number;
    rateLimited: boolean;
    details: {
        questionText: string;
        answer: string | null;
        status: 'generated' | 'stored' | 'failed' | 'rate_limited';
    }[];
}

// ─── Document Types ───

export interface DocumentAttachResult {
    total: number;
    attached: number;
    failed: number;
    details: {
        fieldLabel: string;
        documentType: string;
        status: 'attached' | 'failed' | 'no_document';
        error?: string;
    }[];
}

// ─── Usage Types ───

export interface UsageData {
    autofillsUsed: number;
    autofillsRemaining: number | 'unlimited';
    aiGenerationsUsed: number;
    aiGenerationsRemaining: number | 'unlimited';
    tier: 'free' | 'pro' | 'premium';
    periodStart: string;
    periodEnd: string;
}

// ─── Settings Types ───

export interface ExtensionSettings {
    autoDetectApplications: boolean;
    showFAB: boolean;
    overwriteExistingValues: boolean;
    fillSpeed: 'fast' | 'normal' | 'careful';
    autoOpenReviewSidebar: boolean;
    useAIForOpenEnded: boolean;
    aiResponseLength: 'brief' | 'standard' | 'detailed';
    alwaysReviewAI: boolean;
    autoAttachResume: boolean;
    autoAttachOtherDocs: boolean;
    cacheProfileLocally: boolean;
    sendAnalytics: boolean;
}

// ─── Messaging Types ───

export type MessageType =
    | 'LOGIN'
    | 'LOGOUT'
    | 'GET_AUTH_STATE'
    | 'GET_PROFILE'
    | 'REFRESH_PROFILE'
    | 'GET_PROFILE_READINESS'
    | 'PROFILE_UPDATED'
    | 'IS_APPLICATION_PAGE'
    | 'START_AUTOFILL'
    | 'AUTOFILL_COMPLETE'
    | 'GET_USAGE'
    | 'RECORD_AUTOFILL'
    | 'OPEN_REVIEW_SIDEBAR'
    | 'CLOSE_REVIEW_SIDEBAR'
    | 'PROXY_FETCH'
    | 'CLASSIFY_AND_MAP'
    | 'FETCH_FILE'
    | 'RECORD_AUTOFILL';

export interface ExtensionMessage<T = unknown> {
    type: MessageType;
    payload?: T;
}

export interface ApplicationPageInfo {
    isApplication: boolean;
    atsName: string | null;
    fieldCount: number;
}

export interface ProfileReadiness {
    ready: boolean;
    missing: string[];
    completeness: number;
}
