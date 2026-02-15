import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.EXTENSION_JWT_SECRET || process.env.NEXTAUTH_SECRET || '';

async function verifyExtensionToken(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
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
        const { questions } = body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return NextResponse.json({ error: 'questions array is required' }, { status: 400 });
        }

        if (questions.length > 10) {
            return NextResponse.json({ error: 'Maximum 10 questions per bulk request' }, { status: 400 });
        }

        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY) {
            return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
        }

        // Check stored responses first
        const storedResponses = await prisma.candidateOpenEndedResponse.findMany({
            where: { userId: user.userId },
        });

        // Fetch profile context once
        const profile = await prisma.userProfile.findUnique({
            where: { id: user.userId },
            include: {
                licenses: true,
                certificationRecords: true,
                education: { orderBy: { graduationDate: 'desc' }, take: 2 },
                workExperience: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }], take: 3 },
            },
        });

        const profileContext = buildProfileContext(profile);
        const results = [];

        for (const q of questions) {
            // Check stored first
            const stored = storedResponses.find(
                (r) => r.questionKey === q.questionKey ||
                    r.questionText.toLowerCase().includes(q.questionText.toLowerCase().substring(0, 30))
            );

            if (stored?.response) {
                results.push({
                    answer: stored.response,
                    questionKey: q.questionKey || stored.questionKey,
                    model: 'stored',
                    basedOnStoredResponse: true,
                });
                continue;
            }

            // Generate via AI
            try {
                const prompt = `Generate a professional response for this PMHNP job application question.

**Question:** ${q.questionText}
${q.jobTitle ? `**Position:** ${q.jobTitle}` : ''}
${q.employerName ? `**Employer:** ${q.employerName}` : ''}
${q.jobDescription ? `**Job Context:** ${q.jobDescription.substring(0, 500)}` : ''}

**Candidate:** ${profileContext}

Write approximately ${q.maxLength || 300} characters. Be specific and professional.`;

                const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a career coach for PMHNPs. Generate concise, professional job application responses.',
                            },
                            { role: 'user', content: prompt },
                        ],
                        max_tokens: Math.min((q.maxLength || 300) * 2, 800),
                        temperature: 0.7,
                    }),
                });

                if (aiResponse.ok) {
                    const aiData = await aiResponse.json();
                    const answer = aiData.choices?.[0]?.message?.content?.trim() || '';
                    results.push({
                        answer,
                        questionKey: q.questionKey || '',
                        model: aiData.model || 'gpt-4o-mini',
                        basedOnStoredResponse: false,
                    });
                } else {
                    results.push({
                        answer: '',
                        questionKey: q.questionKey || '',
                        model: '',
                        basedOnStoredResponse: false,
                    });
                }
            } catch {
                results.push({
                    answer: '',
                    questionKey: q.questionKey || '',
                    model: '',
                    basedOnStoredResponse: false,
                });
            }
        }

        // Record bulk usage
        const aiCount = results.filter(r => !r.basedOnStoredResponse && r.answer).length;
        if (aiCount > 0) {
            await prisma.autofillUsage.create({
                data: {
                    userId: user.userId,
                    pageUrl: '',
                    atsName: null,
                    fieldsFilled: 0,
                    aiGenerations: aiCount,
                },
            });
        }

        return NextResponse.json(results);
    } catch (error) {
        console.error('Bulk generation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProfileContext(profile: any): string {
    if (!profile) return 'No profile data available.';
    const parts: string[] = [];
    if (profile.firstName) parts.push(`${profile.firstName} ${profile.lastName || ''}`);
    if (profile.licenses?.length > 0) {
        parts.push(`Licenses: ${profile.licenses.map((l: { licenseType: string; licenseState: string }) => `${l.licenseType} (${l.licenseState})`).join(', ')}`);
    }
    if (profile.certificationRecords?.length > 0) {
        parts.push(`Certifications: ${profile.certificationRecords.map((c: { certificationName: string }) => c.certificationName).join(', ')}`);
    }
    if (profile.workExperience?.length > 0) {
        parts.push(`Experience: ${profile.workExperience.map((w: { jobTitle: string; employerName: string }) => `${w.jobTitle} at ${w.employerName}`).join('; ')}`);
    }
    return parts.join('. ');
}
