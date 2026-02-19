import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyExtensionToken } from '@/lib/verify-extension-token';

interface FieldToClassify {
    label: string;
    placeholder: string;
    attributes: Record<string, string>;
    fieldType: string;
    options: string[];
}

interface ClassifiedField {
    index: number;
    identifier: string;
    profileKey: string | null;
    value: string;
    confidence: number;
    isQuestion: boolean;
}

export async function POST(req: NextRequest) {
    try {
        const user = await verifyExtensionToken(req);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            fields,
            jobTitle = '',
            jobDescription = '',
            employerName = '',
        } = body as {
            fields: FieldToClassify[];
            jobTitle?: string;
            jobDescription?: string;
            employerName?: string;
        };

        if (!fields || !Array.isArray(fields) || fields.length === 0) {
            return NextResponse.json({ error: 'fields array is required' }, { status: 400 });
        }

        // Cap at 20 fields per request
        const fieldsToProcess = fields.slice(0, 40);

        // Fetch candidate profile for context
        const candidateProfile = await prisma.userProfile.findUnique({
            where: { id: user.userId },
            include: {
                licenses: true,
                certificationRecords: true,
                education: { orderBy: { graduationDate: 'desc' } },
                workExperience: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }], take: 5 },
            },
        });

        // Build profile + resume context
        let profileContext = 'No profile data available.';
        try {
            profileContext = buildProfileContext(candidateProfile);
        } catch (ctxErr) {
            console.error('buildProfileContext error:', ctxErr);
        }
        const resumeText = await extractResumeText(candidateProfile?.resumeUrl);

        // Build prompt
        const prompt = buildClassifyPrompt(fieldsToProcess, profileContext, resumeText, jobTitle, employerName, jobDescription);
        console.log(`[Classify] Prompt length: ${prompt.length} chars, ${fieldsToProcess.length} fields`);
        console.log(`[Classify] Resume extracted: ${resumeText ? `YES (${resumeText.length} chars)` : 'NO'}`);
        console.log(`[Classify] Education in profile: ${candidateProfile?.education?.length || 0} records`);
        console.log(`[Classify] Profile context preview: ${profileContext.substring(0, 300)}`);

        // Call OpenAI
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY) {
            return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
        }

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-5.2',
                messages: [
                    { role: 'system', content: systemPrompt() },
                    { role: 'user', content: prompt },
                ],
                max_completion_tokens: 4000,
                temperature: 0.3,
                response_format: { type: 'json_object' },
            }),
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            console.error('OpenAI classify error:', aiResponse.status, errorBody);
            return NextResponse.json({ error: `AI classification failed (${aiResponse.status}): ${errorBody.substring(0, 200)}` }, { status: 502 });
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '{}';
        const finishReason = aiData.choices?.[0]?.finish_reason || 'unknown';
        console.log(`[Classify] AI finish_reason: ${finishReason}, response length: ${content.length} chars`);
        console.log(`[Classify] AI response preview: ${content.substring(0, 500)}`);

        let classified: ClassifiedField[];
        try {
            const parsed = JSON.parse(content);
            classified = parsed.fields || [];
            console.log(`[Classify] Parsed ${classified.length} classified fields`);
        } catch {
            console.error('Failed to parse AI classification response:', content);
            classified = [];
        }

        // Record usage (1 AI generation for the batch)
        await prisma.autofillUsage.create({
            data: {
                userId: user.userId,
                pageUrl: '',
                atsName: null,
                fieldsFilled: 0,
                aiGenerations: 1,
            },
        });

        return NextResponse.json({
            classified,
            model: aiData.model || 'gpt-4o-mini',
            resumeUsed: !!resumeText,
        });
    } catch (error) {
        console.error('AI Classify error:', error instanceof Error ? error.stack : error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ─── Resume Text Extraction ───

async function extractResumeText(resumeUrl: string | null | undefined): Promise<string> {
    if (!resumeUrl) return '';

    try {
        // Fetch the PDF
        const response = await fetch(resumeUrl);
        if (!response.ok) return '';

        const buffer = Buffer.from(await response.arrayBuffer());

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParseModule = require('pdf-parse');
        // pdf-parse exports { PDFParse } — not a default function
        const pdfParse = pdfParseModule.PDFParse || pdfParseModule.default || pdfParseModule;
        if (typeof pdfParse !== 'function') {
            console.error('pdf-parse: no callable export found, keys:', Object.keys(pdfParseModule));
            return '';
        }
        const data = await pdfParse(buffer);

        // Cap at 4000 chars to avoid token limits
        return data.text?.substring(0, 4000) || '';
    } catch (err) {
        console.error('Resume text extraction failed:', err);
        return '';
    }
}

// ─── Profile Context Builder ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProfileContext(profile: any): string {
    if (!profile) return 'No profile data available.';

    const parts: string[] = [];

    // Personal info
    if (profile.firstName || profile.lastName) {
        parts.push(`Name: ${profile.firstName || ''} ${profile.lastName || ''}`.trim());
    }
    if (profile.email) parts.push(`Email: ${profile.email}`);
    if (profile.phone) parts.push(`Phone: ${profile.phone}`);
    if (profile.linkedinUrl) parts.push(`LinkedIn: ${profile.linkedinUrl}`);

    // Full address
    const addrParts = [profile.addressLine1, profile.addressLine2, profile.city, profile.state, profile.zip, profile.country].filter(Boolean);
    if (addrParts.length > 0) parts.push(`Address: ${addrParts.join(', ')}`);
    if (profile.city) parts.push(`City: ${profile.city}`);
    if (profile.state) parts.push(`State: ${profile.state}`);
    if (profile.zip) parts.push(`Zip: ${profile.zip}`);

    // Professional
    if (profile.headline) parts.push(`Headline: ${profile.headline}`);
    if (profile.npiNumber) parts.push(`NPI: ${profile.npiNumber}`);
    if (profile.deaNumber) parts.push(`DEA: ${profile.deaNumber}`);
    if (profile.yearsExperience) parts.push(`Years of Experience: ${profile.yearsExperience}`);
    if (profile.specialties) {
        const specs = Array.isArray(profile.specialties) ? profile.specialties : [profile.specialties];
        if (specs.length > 0) parts.push(`Specialties: ${specs.join(', ')}`);
    }

    if (profile.licenses?.length > 0) {
        const licenseInfo = profile.licenses
            .map((l: { licenseType: string; licenseState: string; licenseNumber: string }) =>
                `${l.licenseType} #${l.licenseNumber} (${l.licenseState})`)
            .join(', ');
        parts.push(`Licenses: ${licenseInfo}`);
        // Also list licensed states explicitly
        const licensedStates = profile.licenses.map((l: { licenseState: string }) => l.licenseState).filter(Boolean);
        if (licensedStates.length > 0) parts.push(`Licensed States: ${licensedStates.join(', ')}`);
    }

    if (profile.certificationRecords?.length > 0) {
        const certInfo = profile.certificationRecords
            .map((c: { certificationName: string; certificationNumber: string }) =>
                `${c.certificationName} #${c.certificationNumber}`)
            .join(', ');
        parts.push(`Certifications: ${certInfo}`);
    }

    if (profile.education?.length > 0) {
        const eduInfo = profile.education
            .map((e: { degreeType: string; schoolName: string; fieldOfStudy: string }) =>
                `${e.degreeType} in ${e.fieldOfStudy || 'N/A'} from ${e.schoolName}`)
            .join('; ');
        parts.push(`Education: ${eduInfo}`);
    }

    if (profile.workExperience?.length > 0) {
        const workInfo = profile.workExperience
            .map((w: { jobTitle: string; employerName: string; isCurrent: boolean; description: string }) =>
                `${w.jobTitle} at ${w.employerName}${w.isCurrent ? ' (current)' : ''}${w.description ? ': ' + w.description.substring(0, 200) : ''}`)
            .join('; ');
        parts.push(`Experience: ${workInfo}`);
    }

    // EEO / Self-identification
    if (profile.gender) parts.push(`Gender: ${profile.gender}`);
    if (profile.raceEthnicity) parts.push(`Race/Ethnicity: ${profile.raceEthnicity}`);
    if (profile.veteranStatus) parts.push(`Veteran Status: ${profile.veteranStatus}`);
    if (profile.disabilityStatus) parts.push(`Disability Status: ${profile.disabilityStatus}`);
    if (profile.workAuthorized != null) parts.push(`Work Authorized in US: ${profile.workAuthorized ? 'Yes' : 'No'}`);
    if (profile.requiresSponsorship != null) parts.push(`Requires Sponsorship: ${profile.requiresSponsorship ? 'Yes' : 'No'}`);

    if (profile.desiredSalary) parts.push(`Desired Salary: ${profile.desiredSalary}`);
    if (profile.willingToRelocate) parts.push('Willing to relocate: Yes');

    return parts.join('\n');
}

// ─── Prompts ───

function systemPrompt(): string {
    return `You are an expert AI assistant for PMHNP (Psychiatric Mental Health Nurse Practitioner) job applications.

Your task is to classify unknown form fields AND provide the best answer/value based on the candidate's profile and resume.

You MUST respond with valid JSON in this format:
{
  "fields": [
    {
      "index": 0,
      "identifier": "field_identifier",
      "profileKey": "matching_profile_field_or_null",
      "value": "the answer or value to fill",
      "confidence": 0.9,
      "isQuestion": true
    }
  ]
}

CRITICAL RULES:
1. For select/dropdown/radio fields that have an options list: your value MUST be an EXACT match of one of the provided options. Never paraphrase, abbreviate, or invent a value. Copy the option string exactly.
2. When matching profile data to dropdown options, find the option that best represents the candidate's actual data. For example, if the candidate's state is "TX" and the options are ["Texas","California",...], return "Texas".
3. For EEO self-identification fields (race, gender, veteran, disability): ALWAYS use the candidate's actual profile data to pick the correct option. Never default to "Decline to self-identify" unless the candidate's profile is blank for that field.
4. For factual fields (name, phone, location, company, license numbers), extract the exact value from the profile/resume. NEVER return an empty value for a factual field if the profile/resume contains the answer.
5. For questions (describe, explain, why), generate a professional first-person answer.
6. For yes/no questions, provide "Yes" or "No" based on the profile.
7. Set confidence between 0.0 and 1.0 based on how certain you are.
8. Set isQuestion=true for open-ended questions requiring generated text.
9. IMPORTANT: If a field asks for basic information like name, email, phone, location, or current company — you MUST fill it from the profile data with high confidence. These are NOT ambiguous fields.
10. Only set confidence to 0 and value to empty string if you truly have NO data to answer with AND the field is not a simple factual field.
11. Use PMHNP-specific clinical terminology when appropriate.
12. Keep generated answers concise and professional.
13. For "Full name" or "Name" fields: combine firstName + lastName from the profile.
14. For "Current location" or "Location" fields: combine city + state from the profile (e.g., "Austin, TX").
15. For "Current company" or "Organization" fields: use the most recent work experience employer name.
16. For "Website", "Portfolio", or "Personal site" fields: ONLY fill if the candidate has a dedicated website URL. Do NOT use the LinkedIn URL as a substitute — LinkedIn and Website are separate fields. If no website URL exists, return an empty value with confidence 0.
17. For "Cover Letter" file upload fields: Do NOT upload the resume. Cover letter and resume are separate documents. If no cover letter document exists, skip the field.
18. For select/dropdown/custom-dropdown fields WITHOUT an options list: provide the best-guess value from the candidate's profile. For degree dropdowns, common Workday options are: "High School or Equivalent", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctorate", "JD", "MD". Map the candidate's degreeType to the closest standard option (e.g., "Master of Science in Nursing" → "Master's Degree").
19. For language proficiency dropdowns: if no options are listed, use the scale "1 - Beginner", "2 - Elementary", "3 - Intermediate", "4 - Advanced", "5 - Fluent". Default to "5 - Fluent" for the candidate's primary language (English).

## FEW-SHOT EXAMPLES

Here are examples of correct classifications for common field types:

### Example 1: Work Authorization (yes/no with dropdown)
Field: Label: "Are you legally authorized to work in the United States?" | Type: select | Options: [Yes | No]
Correct output: { "index": 0, "identifier": "work_auth", "profileKey": "workAuthorized", "value": "Yes", "confidence": 0.95, "isQuestion": false }

### Example 2: Salary Expectation (text input)
Field: Label: "What are your salary expectations?" | Type: text
Correct output: { "index": 1, "identifier": "salary", "profileKey": "desiredSalary", "value": "$145,000 - $165,000", "confidence": 0.8, "isQuestion": false }

### Example 3: Open-ended Screening Question
Field: Label: "Why are you interested in this role?" | Type: textarea
Correct output: { "index": 2, "identifier": "interest", "profileKey": null, "value": "I am passionate about providing psychiatric care and...", "confidence": 0.85, "isQuestion": true }

### Example 4: Visa Sponsorship (radio)
Field: Label: "Will you now or in the future require sponsorship?" | Type: radio | Options: [Yes | No]
Correct output: { "index": 3, "identifier": "sponsorship", "profileKey": "requiresSponsorship", "value": "No", "confidence": 0.95, "isQuestion": false }

### Example 5: How Did You Hear (select)
Field: Label: "How did you hear about us?" | Type: select | Options: [Job Board | LinkedIn | Referral | Company Website | Other]
Correct output: { "index": 4, "identifier": "source", "profileKey": null, "value": "Job Board", "confidence": 0.7, "isQuestion": false }`;
}

function buildClassifyPrompt(
    fields: FieldToClassify[],
    profileContext: string,
    resumeText: string,
    jobTitle: string,
    employerName: string,
    jobDescription: string
): string {
    let prompt = `Classify and provide values for these unrecognized form fields from a job application.\n\n`;

    if (jobTitle) prompt += `**Position:** ${jobTitle}\n`;
    if (employerName) prompt += `**Employer:** ${employerName}\n`;
    if (jobDescription) prompt += `**Job Description:** ${jobDescription.substring(0, 1000)}\n\n`;

    prompt += `**Candidate Profile:**\n${profileContext}\n\n`;

    // Add structured profile field map so the AI knows exactly what data is available
    prompt += `**Available Profile Fields (key → value):**\n`;
    prompt += `- fullName: "${profileContext.match(/Name: (.+)/)?.[1] || 'N/A'}"\n`;
    prompt += `- email: "${profileContext.match(/Email: (.+)/)?.[1] || 'N/A'}"\n`;
    prompt += `- phone: "${profileContext.match(/Phone: (.+)/)?.[1] || 'N/A'}"\n`;
    prompt += `- city: "${profileContext.match(/City: (.+)/)?.[1] || 'N/A'}"\n`;
    prompt += `- state: "${profileContext.match(/State: (.+)/)?.[1] || 'N/A'}"\n`;
    prompt += `- location (city + state): "${profileContext.match(/City: (.+)/)?.[1] || ''}, ${profileContext.match(/State: (.+)/)?.[1] || ''}"\n`;
    prompt += `- linkedin: "${profileContext.match(/LinkedIn: (.+)/)?.[1] || 'N/A'}"\n`;
    prompt += `\nIMPORTANT: For every factual field (name, email, phone, company, location), you MUST provide the value from the profile above. Do NOT return empty values for these fields.\n\n`;

    if (resumeText) {
        prompt += `**Resume Content:**\n${resumeText}\n\n`;
    }

    // ─── Field Clustering ───
    // Group fields by category so the AI understands related fields together
    const categories: { name: string; pattern: RegExp; fields: { field: FieldToClassify; originalIndex: number }[] }[] = [
        { name: '📋 EEO / Self-Identification', pattern: /gender|race|ethnic|veteran|disability|eeo|self.?identify|demographic/i, fields: [] },
        { name: '🔐 Work Authorization & Sponsorship', pattern: /auth|sponsor|visa|work.*permit|legal.*work|eligible|citizen/i, fields: [] },
        { name: '💼 Experience & Qualifications', pattern: /experience|years?|salary|compensation|license|certif|npi|degree|education|start.*date|avail/i, fields: [] },
        { name: '📝 Screening Questions', pattern: /why|how|describe|explain|tell.*us|interest|motivation|additional|comment|cover/i, fields: [] },
    ];
    const uncategorized: { field: FieldToClassify; originalIndex: number }[] = [];

    fields.forEach((field, i) => {
        const searchStr = [field.label || '', field.placeholder || '', field.attributes?.name || '', field.attributes?.id || ''].join(' ');
        let matched = false;
        for (const cat of categories) {
            if (cat.pattern.test(searchStr)) {
                cat.fields.push({ field, originalIndex: i });
                matched = true;
                break;
            }
        }
        if (!matched) uncategorized.push({ field, originalIndex: i });
    });

    // Render categorized fields with headers
    prompt += `**Fields to classify:**\n`;

    const renderField = (field: FieldToClassify, idx: number) => {
        let line = `\n[${idx}] `;
        line += `Label: "${(field.label || 'no label').substring(0, 120)}"`;
        if (field.placeholder) line += ` | Placeholder: "${field.placeholder}"`;
        if (field.fieldType) line += ` | Type: ${field.fieldType}`;

        // Add hint about what this field likely represents
        const name = field.attributes?.name || field.attributes?.id || '';
        if (name) {
            const hints: Record<string, string> = {
                'name': 'Full Name', 'org': 'Current Company/Organization',
                'location': 'Current Location (city, state)', 'comments': 'Additional Information / Cover Letter',
                'phone': 'Phone Number', 'email': 'Email Address',
            };
            const hint = hints[name.toLowerCase()];
            if (hint) line += ` | 💡 This field likely asks for: ${hint}`;
        }

        if (field.options?.length > 0) {
            const opts = field.options.join(' | ');
            line += ` | Options: [${opts}]`;
            if (['select', 'radio', 'custom-dropdown'].includes(field.fieldType)) {
                line += ` ⚠️ VALUE MUST EXACTLY MATCH one of these options`;
            }
        } else if (['select', 'custom-dropdown'].includes(field.fieldType)) {
            // Dropdown without options — give AI a hint about expected values
            const labelLower = (field.label || '').toLowerCase();
            if (/degree/i.test(labelLower)) {
                line += ` | 💡 This is a DEGREE dropdown. Use standard degree level (e.g., "Master's Degree", "Bachelor's Degree"). Map from candidate's degreeType in their profile.`;
            } else if (/language/i.test(labelLower)) {
                line += ` | 💡 This is a LANGUAGE dropdown. Use "English" for the candidate's primary language.`;
            } else if (/comprehension|overall|reading|speaking|writing/i.test(labelLower)) {
                line += ` | 💡 This is a LANGUAGE PROFICIENCY dropdown. Use "5 - Fluent" for native-level proficiency.`;
            }
        }
        const attrStr = Object.entries(field.attributes || {})
            .filter(([k]) => ['name', 'id', 'aria-label', 'data-automation-id'].includes(k))
            .map(([k, v]) => `${k}="${v}"`)
            .join(' ');
        if (attrStr) line += ` | Attrs: ${attrStr}`;
        return line;
    };

    // Render categorized groups first (with headers)
    for (const cat of categories) {
        if (cat.fields.length === 0) continue;
        prompt += `\n\n--- ${cat.name} ---`;
        for (const { field, originalIndex } of cat.fields) {
            prompt += renderField(field, originalIndex);
        }
    }

    // Render uncategorized fields
    if (uncategorized.length > 0) {
        if (categories.some(c => c.fields.length > 0)) {
            prompt += `\n\n--- Other Fields ---`;
        }
        for (const { field, originalIndex } of uncategorized) {
            prompt += renderField(field, originalIndex);
        }
    }

    prompt += `\n\nRespond with JSON containing the "fields" array with one entry per field above. Use the [index] numbers exactly as shown.`;

    return prompt;
}
