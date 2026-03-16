import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyExtensionToken } from '@/lib/verify-extension-token';


export async function POST(req: NextRequest) {
    try {
        const user = await verifyExtensionToken(req);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { jobTitle, employerName, jobDescription } = body;

        if (!jobTitle || !employerName) {
            return NextResponse.json({ error: 'jobTitle and employerName are required' }, { status: 400 });
        }

        // Fetch candidate profile for context
        const profile = await prisma.userProfile.findUnique({
            where: { id: user.userId },
            include: {
                licenses: true,
                certificationRecords: true,
                education: { orderBy: { graduationDate: 'desc' }, take: 2 },
                workExperience: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }], take: 3 },
            },
        });

        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY) {
            return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
        }

        const candidateName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
        const credentials = profile?.licenses?.map(l => `${l.licenseType} (${l.licenseState})`).join(', ') || '';
        const certs = profile?.certificationRecords?.map(c => c.certificationName).join(', ') || '';
        const experience = profile?.workExperience?.map(w =>
            `${w.jobTitle} at ${w.employerName}${w.isCurrent ? ' (current)' : ''}`
        ).join('; ') || '';
        const education = profile?.education?.map(e => `${e.degreeType} from ${e.schoolName}`).join('; ') || '';

        const prompt = `Write a professional cover letter for a PMHNP job application.

**Candidate:** ${candidateName}
**Licenses:** ${credentials}
**Certifications:** ${certs}
**Experience:** ${experience}
**Education:** ${education}

**Position:** ${jobTitle}
**Employer:** ${employerName}
${jobDescription ? `**Job Description (excerpt):** ${jobDescription.substring(0, 1500)}` : ''}

Write a compelling, professional cover letter (3-4 paragraphs). Use first person. Reference specific credentials and experience. Tailor to the employer and position. Do not use placeholder brackets.`;

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-5.2',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional career coach specializing in PMHNP (Psychiatric Mental Health Nurse Practitioner) career services. Write polished, compelling cover letters.',
                    },
                    { role: 'user', content: prompt },
                ],
                max_completion_tokens: 1500,
                temperature: 0.7,
            }),
        });

        if (!aiResponse.ok) {
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const aiData = await aiResponse.json();
        const coverLetter = aiData.choices?.[0]?.message?.content?.trim() || '';

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
            coverLetter,
            model: aiData.model || 'gpt-4o-mini',
        });
    } catch (error) {
        console.error('Cover letter generation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
