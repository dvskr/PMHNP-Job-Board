import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { sendCandidateInquiryNotification } from '@/lib/email-service';

/**
 * POST /api/candidate/messages
 * Allow a job_seeker to message an employer about a specific job posting.
 *
 * Body: { jobId: string, subject: string, body: string }
 *
 * Gating:
 *  - Must be logged in with role 'job_seeker'
 *  - Profile completeness: firstName, headline, specialties required
 *  - 1 message per job posting (can't spam the same employer about the same job)
 *  - 10 messages per 24 hours (generous daily limit)
 */
export async function POST(req: NextRequest) {
    try {
        // Rate limit: 10 messages per 24h
        const rateLimitResponse = await rateLimit(req, 'candidate:messages', RATE_LIMITS.candidateMessage);
        if (rateLimitResponse) return rateLimitResponse;

        // Auth check
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Please log in to message employers' }, { status: 401 });
        }

        // Get candidate profile
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: {
                id: true,
                role: true,
                firstName: true,
                lastName: true,
                headline: true,
                specialties: true,
                email: true,
            },
        });

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        if (profile.role !== 'job_seeker') {
            return NextResponse.json({ error: 'Only job seekers can use this endpoint' }, { status: 403 });
        }

        // Profile completeness check — only first name is required to message
        if (!profile.firstName) {
            return NextResponse.json({
                error: 'Please add your first name to your profile before messaging employers',
                missingFields: ['first name'],
                profileIncomplete: true,
            }, { status: 400 });
        }

        // Parse request body
        const body = await req.json();
        const { jobId, subject, body: messageBody } = body;

        if (!jobId) {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }
        if (!subject || !subject.trim()) {
            return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
        }
        if (!messageBody || !messageBody.trim()) {
            return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
        }
        if (messageBody.length > 2000) {
            return NextResponse.json({ error: 'Message must be under 2000 characters' }, { status: 400 });
        }

        // Verify the job exists and is an employer-posted job
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
                id: true,
                title: true,
                slug: true,
                isPublished: true,
                sourceType: true,
            },
        });

        if (!job || !job.isPublished) {
            return NextResponse.json({ error: 'Job not found or no longer active' }, { status: 404 });
        }

        if (job.sourceType !== 'employer') {
            return NextResponse.json({ error: 'This job does not support direct messaging' }, { status: 400 });
        }

        // Get the employer job record separately
        const employerJobRecord = await prisma.employerJob.findUnique({
            where: { jobId },
            select: { userId: true, contactEmail: true },
        });

        if (!employerJobRecord) {
            return NextResponse.json({ error: 'This job does not support direct messaging' }, { status: 400 });
        }

        // Find the employer's profile (by userId from employerJob)
        let employerProfile = employerJobRecord.userId
            ? await prisma.userProfile.findUnique({
                where: { supabaseId: employerJobRecord.userId },
                select: { id: true, email: true, firstName: true, company: true },
            })
            : null;

        // Fallback: find by contact email if userId didn't work
        if (!employerProfile && employerJobRecord.contactEmail) {
            employerProfile = await prisma.userProfile.findFirst({
                where: { email: employerJobRecord.contactEmail },
                select: { id: true, email: true, firstName: true, company: true },
            });
        }

        if (!employerProfile) {
            return NextResponse.json({ error: 'Unable to reach this employer. They may not have an account yet.' }, { status: 404 });
        }

        // Prevent messaging yourself
        if (employerProfile.id === profile.id) {
            return NextResponse.json({ error: 'You cannot message yourself' }, { status: 400 });
        }

        // Check 1-per-job limit: does a conversation already exist between these two for this job?
        const existingConversation = await prisma.conversation.findFirst({
            where: {
                jobId,
                OR: [
                    { participantA: profile.id, participantB: employerProfile.id },
                    { participantA: employerProfile.id, participantB: profile.id },
                ],
            },
            select: { id: true },
        });

        if (existingConversation) {
            // Reply gating: if candidate already sent a message and employer hasn't replied, block
            const employerReplyCount = await prisma.employerMessage.count({
                where: {
                    conversationId: existingConversation.id,
                    senderId: employerProfile.id,
                },
            });

            const candidateMessageCount = await prisma.employerMessage.count({
                where: {
                    conversationId: existingConversation.id,
                    senderId: profile.id,
                },
            });

            // Block if: candidate already sent a message AND employer hasn't replied
            if (candidateMessageCount > 0 && employerReplyCount === 0) {
                return NextResponse.json({
                    error: 'Please wait for the employer to respond before sending another message',
                    awaitingReply: true,
                    conversationId: existingConversation.id,
                }, { status: 403 });
            }

            // Add the message to the existing conversation
            const cleanBody = sanitizeText(messageBody.trim(), 2000);
            const cleanSubject = sanitizeText(subject.trim(), 200);

            const message = await prisma.employerMessage.create({
                data: {
                    senderId: profile.id,
                    recipientId: employerProfile.id,
                    conversationId: existingConversation.id,
                    jobId,
                    subject: cleanSubject,
                    body: cleanBody,
                },
            });

            await prisma.conversation.update({
                where: { id: existingConversation.id },
                data: { lastMessageAt: new Date(), deletedByA: false, deletedByB: false },
            });

            // Send email notification
            const candidateName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'A candidate';
            if (employerProfile.email) {
                sendCandidateInquiryNotification(
                    employerProfile.email,
                    employerProfile.firstName,
                    candidateName,
                    cleanSubject,
                    cleanBody,
                    job.title,
                ).catch(err => console.error('Candidate inquiry email error:', err));
            }

            return NextResponse.json({
                success: true,
                conversationId: existingConversation.id,
                message: {
                    id: message.id,
                    sentAt: message.sentAt.toISOString(),
                },
            }, { status: 201 });
        }

        // Sanitize inputs
        const cleanSubject = sanitizeText(subject.trim(), 200);
        const cleanBody = sanitizeText(messageBody.trim(), 2000);

        // Create the conversation
        const conversation = await prisma.conversation.create({
            data: {
                participantA: profile.id,
                participantB: employerProfile.id,
                jobId,
                subject: cleanSubject,
            },
        });

        // Create the first message
        const message = await prisma.employerMessage.create({
            data: {
                senderId: profile.id,
                recipientId: employerProfile.id,
                conversationId: conversation.id,
                jobId,
                subject: cleanSubject,
                body: cleanBody,
            },
        });

        // Update conversation's lastMessageAt
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
        });

        // Send email notification to employer (non-blocking)
        const candidateName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'A candidate';

        if (employerProfile.email) {
            sendCandidateInquiryNotification(
                employerProfile.email,
                employerProfile.firstName,
                candidateName,
                cleanSubject,
                cleanBody,
                job.title,
            ).catch(err => console.error('Candidate inquiry email error:', err));
        }

        return NextResponse.json({
            success: true,
            conversationId: conversation.id,
            message: {
                id: message.id,
                sentAt: message.sentAt.toISOString(),
            },
        }, { status: 201 });

    } catch (error) {
        console.error('Error sending candidate message:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
