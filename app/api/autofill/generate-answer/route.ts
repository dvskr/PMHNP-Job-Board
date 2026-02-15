import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.EXTENSION_JWT_SECRET || process.env.NEXTAUTH_SECRET || '';

async function verifyExtensionToken(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.slice(7);
    try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        if (payload.purpose !== 'extension') return null;
        return payload as { userId: string; supabaseId: string; email: string; role: string };
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await verifyExtensionToken(req);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            questionText,
            questionKey,
            jobTitle,
            jobDescription,
            employerName,
            maxLength = 300,
        } = body;

        if (!questionText) {
            return NextResponse.json({ error: 'questionText is required' }, { status: 400 });
        }

        // Check usage / rate limits
        const profile = await prisma.userProfile.findUnique({
            where: { id: user.userId },
            select: { role: true },
        });

        const tier = profile?.role === 'premium' ? 'premium' : profile?.role === 'pro' ? 'pro' : 'free';
        const aiLimit = tier === 'free' ? 10 : tier === 'pro' ? 100 : Infinity;

        // Count this month's AI generations
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const usageCount = await prisma.autofillUsage.count({
            where: {
                userId: user.userId,
                createdAt: { gte: startOfMonth },
                aiGenerations: { gt: 0 },
            },
        });

        if (usageCount >= aiLimit) {
            return NextResponse.json(
                { error: 'AI generation limit reached for this month', tier, limit: aiLimit },
                { status: 429 }
            );
        }

        // Check if we have a stored open-ended response that matches
        const storedResponses = await prisma.candidateOpenEndedResponse.findMany({
            where: { userId: user.userId },
        });

        const matchingStored = storedResponses.find(
            (r) =>
                r.questionKey === questionKey ||
                r.questionText.toLowerCase().includes(questionText.toLowerCase().substring(0, 30))
        );

        if (matchingStored?.response) {
            return NextResponse.json({
                answer: matchingStored.response,
                questionKey: questionKey || matchingStored.questionKey,
                model: 'stored',
                basedOnStoredResponse: true,
            });
        }

        // Fetch candidate profile for context
        const candidateProfile = await prisma.userProfile.findUnique({
            where: { id: user.userId },
            include: {
                licenses: true,
                certificationRecords: true,
                education: { orderBy: { graduationDate: 'desc' } },
                workExperience: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }], take: 3 },
            },
        });

        // Build AI prompt
        const profileContext = buildProfileContext(candidateProfile);
        const prompt = buildPrompt(questionText, jobTitle, jobDescription, employerName, profileContext, maxLength);

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
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt() },
                    { role: 'user', content: prompt },
                ],
                max_tokens: Math.min(maxLength * 2, 1000),
                temperature: 0.7,
            }),
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            console.error('OpenAI error:', errorBody);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const aiData = await aiResponse.json();
        const answer = aiData.choices?.[0]?.message?.content?.trim() || '';

        // Record usage
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
            answer,
            questionKey: questionKey || '',
            model: aiData.model || 'gpt-4o-mini',
            basedOnStoredResponse: false,
        });
    } catch (error) {
        console.error('AI Generation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProfileContext(profile: any): string {
    if (!profile) return 'No profile data available.';

    const parts: string[] = [];

    if (profile.firstName || profile.lastName) {
        parts.push(`Name: ${profile.firstName || ''} ${profile.lastName || ''}`.trim());
    }

    if (profile.licenses?.length > 0) {
        const licenseInfo = profile.licenses
            .map((l: { licenseType: string; licenseState: string }) => `${l.licenseType} (${l.licenseState})`)
            .join(', ');
        parts.push(`Licenses: ${licenseInfo}`);
    }

    if (profile.certificationRecords?.length > 0) {
        const certInfo = profile.certificationRecords
            .map((c: { certificationName: string }) => c.certificationName)
            .join(', ');
        parts.push(`Certifications: ${certInfo}`);
    }

    if (profile.education?.length > 0) {
        const eduInfo = profile.education
            .map((e: { degreeType: string; schoolName: string }) => `${e.degreeType} from ${e.schoolName}`)
            .join('; ');
        parts.push(`Education: ${eduInfo}`);
    }

    if (profile.workExperience?.length > 0) {
        const workInfo = profile.workExperience
            .map((w: { jobTitle: string; employerName: string; isCurrent: boolean }) =>
                `${w.jobTitle} at ${w.employerName}${w.isCurrent ? ' (current)' : ''}`)
            .join('; ');
        parts.push(`Experience: ${workInfo}`);
    }

    return parts.join('\n');
}

function systemPrompt(): string {
    return `You are an expert career coach and professional writer specializing in Psychiatric Mental Health Nurse Practitioner (PMHNP) job applications. 

Your task is to generate professional, compelling responses to job application questions. 

Guidelines:
- Write in first person as the candidate
- Be specific and use clinical terminology appropriate for PMHNPs
- Reference the candidate's actual credentials and experience when provided
- Keep responses concise and within the requested length
- Be professional but personable
- Avoid generic filler language
- Tailor each response to the specific employer and position when context is available`;
}

function buildPrompt(
    questionText: string,
    jobTitle: string,
    jobDescription: string,
    employerName: string,
    profileContext: string,
    maxLength: number
): string {
    let prompt = `Generate a professional response for this job application question.\n\n`;
    prompt += `**Question:** ${questionText}\n\n`;

    if (jobTitle) prompt += `**Position:** ${jobTitle}\n`;
    if (employerName) prompt += `**Employer:** ${employerName}\n`;
    if (jobDescription) prompt += `**Job Description (excerpt):** ${jobDescription.substring(0, 1000)}\n\n`;

    prompt += `**Candidate Profile:**\n${profileContext}\n\n`;
    prompt += `**Requirements:** Write a response of approximately ${maxLength} characters. Be specific, professional, and tailored to this role.`;

    return prompt;
}
