import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getResumeUrl, getPathFromUrl } from '@/lib/supabase-storage'

function tryParseJson(val: string | null): string[] | null {
    if (!val) return null
    try {
        const parsed = JSON.parse(val)
        return Array.isArray(parsed) ? parsed : [val]
    } catch {
        // Fall back to comma-separated
        return val.split(',').map((s: string) => s.trim()).filter(Boolean)
    }
}

// GET /api/profile/export — full structured profile for Chrome extension
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            include: {
                licenses: true,
                certificationRecords: true,
                education: { orderBy: { graduationDate: 'desc' } },
                workExperience: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] },
                screeningAnswers: true,
                openEndedResponses: true,
                documents: true,
                candidateReferences: true,
            },
        })

        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const exportData = {
            personal: {
                firstName: profile.firstName,
                lastName: profile.lastName,
                email: profile.email,
                phone: profile.phone,
                address: {
                    line1: profile.addressLine1,
                    line2: profile.addressLine2,
                    city: profile.city,
                    state: profile.state,
                    zip: profile.zipCode,
                    country: profile.country,
                },
                linkedinUrl: profile.linkedinUrl,
                avatarUrl: profile.avatarUrl,
            },
            eeo: {
                workAuthorized: profile.workAuthorized,
                requiresSponsorship: profile.requiresSponsorship,
                veteranStatus: profile.veteranStatus,
                disabilityStatus: profile.disabilityStatus,
                raceEthnicity: profile.raceEthnicity,
                gender: profile.gender,
            },
            credentials: {
                licenses: profile.licenses.map((l) => ({
                    licenseType: l.licenseType,
                    licenseNumber: l.licenseNumber,
                    licenseState: l.licenseState,
                    expirationDate: l.expirationDate,
                    status: l.status,
                })),
                certifications: profile.certificationRecords.map((c) => ({
                    certificationName: c.certificationName,
                    certifyingBody: c.certifyingBody,
                    certificationNumber: c.certificationNumber,
                    expirationDate: c.expirationDate,
                })),
                npiNumber: profile.npiNumber,
                deaNumber: profile.deaNumber,
                deaExpirationDate: profile.deaExpirationDate,
                deaScheduleAuthority: profile.deaScheduleAuthority,
                stateControlledSubstanceReg: profile.stateControlledSubstanceReg,
                stateCSRExpirationDate: profile.stateCSRExpirationDate,
                pmpRegistered: profile.pmpRegistered,
            },
            malpractice: {
                carrier: profile.malpracticeCarrier,
                policyNumber: profile.malpracticePolicyNumber,
                coverage: profile.malpracticeCoverage,
                claimsHistory: profile.malpracticeClaimsHistory,
                claimsDetails: profile.malpracticeClaimsDetails,
            },
            practiceAuthority: {
                fullPracticeAuthority: profile.fullPracticeAuthority,
                collaborativeAgreementReq: profile.collaborativeAgreementReq,
                collaboratingPhysicianName: profile.collaboratingPhysicianName,
                collaboratingPhysicianContact: profile.collaboratingPhysicianContact,
                prescriptiveAuthorityStatus: profile.prescriptiveAuthorityStatus,
            },
            education: profile.education.map((e) => ({
                degreeType: e.degreeType,
                fieldOfStudy: e.fieldOfStudy,
                schoolName: e.schoolName,
                graduationDate: e.graduationDate,
                gpa: e.gpa,
                isHighestDegree: e.isHighestDegree,
            })),
            workExperience: profile.workExperience.map((w) => ({
                jobTitle: w.jobTitle,
                employerName: w.employerName,
                employerCity: w.employerCity,
                employerState: w.employerState,
                startDate: w.startDate,
                endDate: w.endDate,
                isCurrent: w.isCurrent,
                supervisorName: w.supervisorName,
                supervisorPhone: w.supervisorPhone,
                supervisorEmail: w.supervisorEmail,
                mayContact: w.mayContact,
                reasonForLeaving: w.reasonForLeaving,
                description: w.description,
                clinicalDetails: {
                    patientVolume: w.patientVolume,
                    patientPopulations: tryParseJson(w.patientPopulations),
                    treatmentModalities: tryParseJson(w.treatmentModalities),
                    disordersTreated: tryParseJson(w.disordersTreated),
                    practiceSetting: w.practiceSetting,
                    telehealthExperience: w.telehealthExperience,
                    telehealthPlatforms: tryParseJson(w.telehealthPlatforms),
                    ehrSystems: tryParseJson(w.ehrSystems),
                    prescribingExp: w.prescribingExp,
                    prescribingSchedules: w.prescribingSchedules,
                    assessmentTools: tryParseJson(w.assessmentTools),
                    supervisoryRole: w.supervisoryRole,
                    supervisoryDetails: w.supervisoryDetails,
                },
            })),
            screeningAnswers: (() => {
                const grouped: Record<string, Record<string, { answer: boolean | null; details: string | null }>> = {
                    background: {},
                    clinical: {},
                    logistics: {},
                }
                for (const a of profile.screeningAnswers) {
                    const cat = a.category.toLowerCase().includes('background') ? 'background'
                        : a.category.toLowerCase().includes('clinical') ? 'clinical'
                            : 'logistics'
                    grouped[cat][a.questionKey] = { answer: a.answerBool, details: a.answerText }
                }
                return grouped
            })(),
            openEndedResponses: Object.fromEntries(
                profile.openEndedResponses.map((r) => [
                    r.questionKey,
                    { questionText: r.questionText, response: r.response, isAIGenerated: r.isAIGenerated },
                ])
            ),
            documents: profile.documents.map((d) => ({
                documentType: d.documentType,
                documentLabel: d.documentLabel,
                fileUrl: d.fileUrl,
                fileName: d.fileName,
                expirationDate: d.expirationDate,
            })),
            references: profile.candidateReferences.map((r) => ({
                fullName: r.fullName,
                title: r.title,
                organization: r.organization,
                phone: r.phone,
                email: r.email,
                relationship: r.relationship,
                yearsKnown: r.yearsKnown,
            })),
            preferences: {
                preferredWorkMode: profile.preferredWorkMode,
                preferredJobType: profile.preferredJobType,
                desiredSalaryMin: profile.desiredSalaryMin,
                desiredSalaryMax: profile.desiredSalaryMax,
                desiredSalaryType: profile.desiredSalaryType,
                availableDate: profile.availableDate,
                openToOffers: profile.openToOffers,
            },
            meta: {
                lastUpdated: profile.updatedAt,
                resumeUrl: await (async () => {
                    if (!profile.resumeUrl) return null;
                    // If it's a Supabase storage URL, extract path and generate fresh signed URL
                    const storagePath = getPathFromUrl(profile.resumeUrl);
                    if (storagePath) {
                        try {
                            return await getResumeUrl(storagePath);
                        } catch (e) {
                            console.error('Failed to generate signed URL:', e);
                            return profile.resumeUrl; // Fallback to stored URL
                        }
                    }
                    return profile.resumeUrl;
                })(),
            },
        }

        return NextResponse.json(exportData, {
            headers: { 'Cache-Control': 'private, max-age=30' },
        })
    } catch (err) {
        console.error('Profile export error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
