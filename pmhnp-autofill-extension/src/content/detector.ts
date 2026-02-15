import type { DetectedField, FieldCategory } from '@/shared/types';

// ─── Field Dictionary ───
// Maps label/attribute patterns to field identifiers

const FIELD_PATTERNS: Record<string, { patterns: string[]; category: FieldCategory }> = {
    // Personal
    first_name: { patterns: ['first name', 'first_name', 'firstname', 'fname', 'given name', 'legalnamefirstname'], category: 'personal' },
    last_name: { patterns: ['last name', 'last_name', 'lastname', 'lname', 'surname', 'family name', 'legalnamelastname'], category: 'personal' },
    full_name: { patterns: ['full name', 'fullname', 'your name', 'candidate name', 'applicant name'], category: 'personal' },
    email: { patterns: ['email', 'e-mail', 'email address', 'e-mail address'], category: 'personal' },
    phone: { patterns: ['phone', 'telephone', 'mobile', 'cell', 'phone number', 'contact number'], category: 'personal' },
    address_line1: { patterns: ['address', 'street', 'address line 1', 'street address', 'address1'], category: 'personal' },
    address_line2: { patterns: ['address line 2', 'apt', 'suite', 'unit', 'address2', 'apartment'], category: 'personal' },
    city: { patterns: ['city', 'town'], category: 'personal' },
    state: { patterns: ['state', 'province', 'region'], category: 'personal' },
    zip: { patterns: ['zip', 'postal', 'zip code', 'postal code', 'zipcode'], category: 'personal' },
    country: { patterns: ['country', 'nation'], category: 'personal' },
    linkedin: { patterns: ['linkedin', 'linkedin url', 'linkedin profile'], category: 'personal' },

    // Credentials
    npi_number: { patterns: ['npi', 'national provider', 'npi number', 'provider identifier'], category: 'credential' },
    dea_number: { patterns: ['dea', 'dea number', 'dea license', 'dea registration'], category: 'credential' },
    dea_expiration: { patterns: ['dea expiration', 'dea exp'], category: 'credential' },
    license_number: { patterns: ['license number', 'license #', 'license no', 'rn license', 'rn #', 'aprn license', 'aprn', 'advanced practice'], category: 'credential' },
    license_state: { patterns: ['license state', 'state of licensure', 'licensing state'], category: 'credential' },
    license_expiration: { patterns: ['license expiration', 'license exp', 'expiration date'], category: 'credential' },
    certification_number: { patterns: ['certification number', 'cert number', 'ancc', 'board certification'], category: 'credential' },
    prescriptive_authority: { patterns: ['prescriptive authority', 'prescribing authority'], category: 'credential' },

    // Education
    degree: { patterns: ['degree', 'highest degree', 'education level', 'degree type'], category: 'education' },
    school: { patterns: ['school', 'university', 'college', 'institution', 'school name'], category: 'education' },
    graduation_date: { patterns: ['graduation', 'grad date', 'date of graduation', 'graduation date'], category: 'education' },
    field_of_study: { patterns: ['field of study', 'major', 'program', 'specialty', 'area of study'], category: 'education' },
    gpa: { patterns: ['gpa', 'grade point', 'grade point average'], category: 'education' },

    // Experience
    job_title: { patterns: ['job title', 'title', 'position', 'role', 'current title'], category: 'experience' },
    employer: { patterns: ['employer', 'company', 'organization', 'facility', 'company name', 'employer name'], category: 'experience' },
    start_date: { patterns: ['start date', 'from date', 'date started', 'from'], category: 'experience' },
    end_date: { patterns: ['end date', 'to date', 'date ended', 'to'], category: 'experience' },
    supervisor: { patterns: ['supervisor', 'manager', 'reporting to', 'supervisor name'], category: 'experience' },
    reason_leaving: { patterns: ['reason for leaving', 'reason left', 'why did you leave'], category: 'experience' },

    // Screening
    felony: { patterns: ['felony', 'convicted of a felony', 'felony conviction'], category: 'screening' },
    misdemeanor: { patterns: ['misdemeanor', 'misdemeanor conviction'], category: 'screening' },
    license_revoked: { patterns: ['revoked', 'suspended', 'restricted', 'license ever been revoked'], category: 'screening' },
    malpractice: { patterns: ['malpractice', 'lawsuit', 'malpractice claim'], category: 'screening' },
    background_check: { patterns: ['background check', 'consent to background'], category: 'screening' },
    drug_screen: { patterns: ['drug screen', 'drug test'], category: 'screening' },
    work_authorized: { patterns: ['authorized to work', 'legally authorized', 'work authorization', 'eligible to work'], category: 'screening' },
    visa_sponsorship: { patterns: ['sponsorship', 'visa sponsorship', 'require sponsorship'], category: 'screening' },
    salary: { patterns: ['salary', 'desired salary', 'compensation', 'pay rate', 'expected salary', 'salary expectation'], category: 'screening' },
    start_date_available: { patterns: ['start date', 'earliest start', 'available date', 'when can you start', 'availability'], category: 'screening' },

    // EEO
    veteran: { patterns: ['veteran', 'military', 'veteran status'], category: 'eeo' },
    disability: { patterns: ['disability', 'disabled', 'disability status'], category: 'eeo' },
    race_ethnicity: { patterns: ['race', 'ethnicity', 'race/ethnicity', 'racial'], category: 'eeo' },
    gender: { patterns: ['gender', 'sex', 'gender identity'], category: 'eeo' },

    // Document
    resume_upload: { patterns: ['resume', 'cv', 'curriculum vitae'], category: 'document' },
    cover_letter_upload: { patterns: ['cover letter', 'covering letter'], category: 'document' },
    license_upload: { patterns: ['upload license', 'license document', 'attach license'], category: 'document' },
    certification_upload: { patterns: ['upload certification', 'certification document'], category: 'document' },
    other_upload: { patterns: ['upload', 'attach', 'document', 'attachment'], category: 'document' },
};

// Open-ended question patterns
const OPEN_ENDED_PATTERNS = [
    'describe', 'explain', 'tell us', 'why', 'how do you', 'what makes you',
    'clinical approach', 'treatment philosophy', 'leadership style',
    'career goals', 'professional development', 'additional information',
    'cover letter', 'summary of qualifications', 'anything else',
    'why are you interested', 'what experience', 'strengths',
];

// ─── Detection Functions ───

function isElementVisible(el: HTMLElement): boolean {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function getFieldType(el: HTMLElement): DetectedField['fieldType'] | null {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') {
        const type = (el as HTMLInputElement).type.toLowerCase();
        if (type === 'file') return 'file';
        if (type === 'radio') return 'radio';
        if (type === 'checkbox') return 'checkbox';
        if (['text', 'email', 'tel', 'url', 'number', 'date', 'month', 'password', 'search', ''].includes(type)) return 'input';
        return null;
    }
    // Custom div-based inputs (Workday etc.)
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox') return 'select';
    if (el.contentEditable === 'true') return 'textarea';
    return null;
}

function findLabelText(el: HTMLElement): string {
    // 1. Explicit label via for= attribute
    const id = el.id;
    if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent?.trim() || '';
    }

    // 2. Wrapping label
    const parentLabel = el.closest('label');
    if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        // Remove the input itself from the clone so we get only label text
        const inputs = clone.querySelectorAll('input, select, textarea');
        inputs.forEach((i) => i.remove());
        return clone.textContent?.trim() || '';
    }

    // 3. aria-labelledby
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
        const parts = labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
    }

    // 4. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 5. Nearby text: look at previous sibling, parent text
    const prev = el.previousElementSibling;
    if (prev && prev.tagName.toLowerCase() !== 'input') {
        const text = prev.textContent?.trim() || '';
        if (text.length > 0 && text.length < 100) return text;
    }

    // 6. Parent container text (e.g. div wrapping label + input)
    const parent = el.parentElement;
    if (parent) {
        const labels = parent.querySelectorAll('label, .label, [class*="label"]');
        for (const l of labels) {
            const text = l.textContent?.trim() || '';
            if (text.length > 0 && text.length < 100) return text;
        }
    }

    return '';
}

function matchPatterns(text: string): { identifier: string; category: FieldCategory; confidence: number } | null {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    if (!normalized) return null;

    let bestMatch: { identifier: string; category: FieldCategory; confidence: number } | null = null;
    let bestScore = 0;

    for (const [identifier, { patterns, category }] of Object.entries(FIELD_PATTERNS)) {
        for (const pattern of patterns) {
            // Exact match
            if (normalized === pattern) {
                return { identifier, category, confidence: 1.0 };
            }
            // Contains match
            if (normalized.includes(pattern)) {
                const score = pattern.length / normalized.length;
                const confidence = Math.min(0.95, 0.6 + score * 0.35);
                if (confidence > bestScore) {
                    bestScore = confidence;
                    bestMatch = { identifier, category, confidence };
                }
            }
            // Pattern contains normalized (e.g. input is "name", pattern is "first name")
            if (pattern.includes(normalized) && normalized.length >= 3) {
                const score = normalized.length / pattern.length;
                const confidence = 0.4 + score * 0.3;
                if (confidence > bestScore) {
                    bestScore = confidence;
                    bestMatch = { identifier, category, confidence };
                }
            }
        }
    }

    return bestMatch;
}

function identifyField(el: HTMLElement, label: string): { identifier: string; category: FieldCategory; confidence: number } {
    // Priority 1: label text
    const fromLabel = matchPatterns(label);
    if (fromLabel && fromLabel.confidence > 0.7) return fromLabel;

    // Priority 2: name, id, placeholder, aria-label attributes
    const attrs = [
        el.getAttribute('name'),
        el.id,
        (el as HTMLInputElement).placeholder,
        el.getAttribute('aria-label'),
        el.getAttribute('data-automation-id'),
        el.getAttribute('data-test'),
        el.getAttribute('autocomplete'),
    ].filter(Boolean) as string[];

    for (const attr of attrs) {
        const match = matchPatterns(attr);
        if (match) {
            // Slightly lower confidence since from attribute, not label
            match.confidence = Math.max(0.5, match.confidence - 0.1);
            if (!fromLabel || match.confidence > fromLabel.confidence) {
                return match;
            }
        }
    }

    // Priority 3: autocomplete attribute (high confidence)
    const autocomplete = el.getAttribute('autocomplete');
    if (autocomplete) {
        const autoMap: Record<string, string> = {
            'given-name': 'first_name', 'family-name': 'last_name', 'name': 'full_name',
            'email': 'email', 'tel': 'phone', 'street-address': 'address_line1',
            'address-line1': 'address_line1', 'address-line2': 'address_line2',
            'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'zip',
            'country': 'country',
        };
        const mapped = autoMap[autocomplete];
        if (mapped) {
            const patternEntry = FIELD_PATTERNS[mapped];
            return { identifier: mapped, category: patternEntry?.category || 'personal', confidence: 0.9 };
        }
    }

    // Check for open-ended textarea
    if (el.tagName.toLowerCase() === 'textarea') {
        const maxLen = parseInt(el.getAttribute('maxlength') || '0', 10);
        if (maxLen === 0 || maxLen > 100) {
            const allText = (label + ' ' + (el as HTMLTextAreaElement).placeholder).toLowerCase();
            const isOpenEnded = OPEN_ENDED_PATTERNS.some((p) => allText.includes(p));
            if (isOpenEnded) {
                return { identifier: 'open_ended_question', category: 'open_ended', confidence: 0.7 };
            }
        }
    }

    // Fallback to label match even at low confidence
    if (fromLabel) return fromLabel;

    return { identifier: 'unknown', category: 'unknown', confidence: 0 };
}

function getSelectOptions(el: HTMLElement): string[] {
    if (el.tagName.toLowerCase() === 'select') {
        return Array.from((el as HTMLSelectElement).options).map((o) => o.text.trim()).filter(Boolean);
    }
    return [];
}

// ─── Main Detection ───

export function detectFormFields(): DetectedField[] {
    const fields: DetectedField[] = [];
    const processedElements = new Set<HTMLElement>();

    function processElements(root: Document | ShadowRoot) {
        const elements = root.querySelectorAll<HTMLElement>(
            'input, select, textarea, [role="combobox"], [role="listbox"], [contenteditable="true"]'
        );

        for (const el of elements) {
            if (processedElements.has(el)) continue;
            processedElements.add(el);

            // Skip hidden fields
            const inputType = (el as HTMLInputElement).type?.toLowerCase();
            if (inputType === 'hidden' || inputType === 'submit' || inputType === 'button' || inputType === 'reset') continue;
            if (!isElementVisible(el)) continue;

            const fieldType = getFieldType(el);
            if (!fieldType) continue;

            // Handle radio buttons: only process the first one in a group
            if (fieldType === 'radio') {
                const name = (el as HTMLInputElement).name;
                if (name) {
                    const existing = fields.find((f) => f.fieldType === 'radio' && f.name === name);
                    if (existing) continue;
                }
            }

            const label = findLabelText(el);
            const { identifier, category, confidence } = identifyField(el, label);

            fields.push({
                element: el,
                fieldType,
                identifier,
                confidence,
                label,
                name: (el as HTMLInputElement).name || '',
                id: el.id || '',
                placeholder: (el as HTMLInputElement).placeholder || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
                currentValue: (el as HTMLInputElement).value || '',
                options: getSelectOptions(el),
                fieldCategory: category,
                atsSpecific: false,
            });
        }

        // Recursively traverse Shadow DOM trees
        traverseShadowRoots(root);
    }

    // Walk every element, check for shadowRoot, and process it
    function traverseShadowRoots(root: Document | ShadowRoot | Element) {
        const allElements = root.querySelectorAll('*');
        for (const el of allElements) {
            if (el.shadowRoot) {
                processElements(el.shadowRoot);
            }
        }
    }

    // Process main document
    processElements(document);

    // Process same-origin iframes
    try {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const doc = iframe.contentDocument;
                if (doc) processElements(doc);
            } catch {
                // Cross-origin iframe — skip
            }
        }
    } catch {
        // iframe access error
    }

    return fields;
}

// ─── ATS Detection ───

export function detectATS(): { name: string; confidence: number } | null {
    const url = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();

    const atsPatterns: { name: string; urlPatterns: string[]; domChecks?: () => boolean }[] = [
        {
            name: 'Workday',
            urlPatterns: ['myworkdayjobs.com', 'wd5.myworkday.com', 'workday.com/en-us/careers'],
            domChecks: () => !!document.querySelector('[data-automation-id]'),
        },
        {
            name: 'Greenhouse',
            urlPatterns: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
            domChecks: () => !!document.getElementById('application_form') || !!document.querySelector('.application-form'),
        },
        {
            name: 'Lever',
            urlPatterns: ['jobs.lever.co', 'lever.co/apply'],
            domChecks: () => !!document.querySelector('.posting-page') || !!document.querySelector('.application-form'),
        },
        {
            name: 'iCIMS',
            urlPatterns: ['icims.com', 'careers-'],
            domChecks: () => !!document.querySelector('[class*="iCIMS"]'),
        },
        {
            name: 'Ashby',
            urlPatterns: ['jobs.ashbyhq.com', 'ashbyhq.com'],
        },
        {
            name: 'SmartRecruiters',
            urlPatterns: ['jobs.smartrecruiters.com'],
            domChecks: () => !!document.querySelector('.js-application-form'),
        },
        {
            name: 'BambooHR',
            urlPatterns: ['bamboohr.com/careers', 'bamboohr.com/jobs'],
        },
    ];

    for (const ats of atsPatterns) {
        const urlMatch = ats.urlPatterns.some((p) => url.includes(p) || hostname.includes(p));
        if (urlMatch) {
            const domMatch = ats.domChecks ? ats.domChecks() : true;
            return { name: ats.name, confidence: domMatch ? 0.95 : 0.7 };
        }
    }

    return null;
}

// ─── Application Page Check ───

export function isApplicationPage(): boolean {
    const fields = detectFormFields();

    // URL-based detection: if on a known ATS domain, be more lenient with field count
    const url = window.location.href.toLowerCase();
    const knownATSDomains = [
        'jobs.smartrecruiters.com',
        'boards.greenhouse.io',
        'jobs.lever.co',
        'myworkdayjobs.com',
        'icims.com',
        'ashbyhq.com',
        'bamboohr.com',
        'apply.workable.com',
    ];
    const isKnownATS = knownATSDomains.some(d => url.includes(d));

    // On known ATS, even 1 field is enough to consider it an application page
    if (isKnownATS && fields.length >= 1) return true;
    // On known ATS with no fields yet (SPA loading), still return true
    if (isKnownATS) return true;

    // Generic detection: need at least 3 fields with personal info
    if (fields.length < 3) return false;
    const hasPersonal = fields.some(
        (f) => f.fieldCategory === 'personal' && f.confidence > 0.5
    );
    const hasMultipleFields = fields.filter((f) => f.confidence > 0.3).length >= 3;

    return hasPersonal && hasMultipleFields;
}
