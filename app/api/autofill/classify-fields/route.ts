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
        const fieldsToProcess = fields.slice(0, 20);

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
                max_completion_tokens: 2000,
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

        let classified: ClassifiedField[];
        try {
            const parsed = JSON.parse(content);
            classified = parsed.fields || [];
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
        const pdfParse = require('pdf-parse');
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
    if (profile.specialties?.length > 0) parts.push(`Specialties: ${profile.specialties.join(', ')}`);

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
4. For factual fields (name, phone, license numbers), extract the exact value from the profile/resume.
5. For questions (describe, explain, why), generate a professional first-person answer.
6. For yes/no questions, provide "Yes" or "No" based on the profile.
7. Set confidence between 0.0 and 1.0 based on how certain you are.
8. Set isQuestion=true for open-ended questions requiring generated text.
9. If you truly cannot determine what a field is asking, set confidence to 0 and value to empty string.
10. Use PMHNP-specific clinical terminology when appropriate.
11. Keep generated answers concise and professional.`;
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

    if (resumeText) {
        prompt += `**Resume Content:**\n${resumeText}\n\n`;
    }

    prompt += `**Fields to classify:**\n`;
    fields.forEach((field, i) => {
        prompt += `\n[${i}] `;
        prompt += `Label: "${(field.label || 'no label').substring(0, 120)}"`;
        if (field.placeholder) prompt += ` | Placeholder: "${field.placeholder}"`;
        if (field.fieldType) prompt += ` | Type: ${field.fieldType}`;
        if (field.options?.length > 0) {
            const opts = field.options.join(' | ');
            prompt += ` | Options: [${opts}]`;
            if (['select', 'radio', 'custom-dropdown'].includes(field.fieldType)) {
                prompt += ` ⚠️ VALUE MUST EXACTLY MATCH one of these options`;
            }
        }
        const attrStr = Object.entries(field.attributes || {})
            .filter(([k]) => ['name', 'id', 'aria-label', 'data-automation-id'].includes(k))
            .map(([k, v]) => `${k}="${v}"`)
            .join(' ');
        if (attrStr) prompt += ` | Attrs: ${attrStr}`;
    });

    prompt += `\n\nRespond with JSON containing the "fields" array with one entry per field above.`;

    return prompt;
}
