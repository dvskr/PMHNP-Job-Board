import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { requireEmployer } from '@/lib/auth/protect';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import ApplicantsTab from '@/components/employer/ApplicantsTab';

export const metadata: Metadata = {
    title: 'Applicants',
    description: 'Review candidates who have applied to your PMHNP job postings.',
    robots: { index: false, follow: false },
};

/**
 * Dedicated Applicants surface.
 *
 * Originally Applicants was a sub-tab inside `/employer/dashboard`, reachable
 * via the top-nav as `/employer/dashboard?tab=applicants`. That kept the
 * dashboard chrome (stat cards, "Employer Dashboard" title, every other tab)
 * visible above the applicant list — so clicking "Applicants" in the nav
 * felt like landing on the dashboard, not a focused applicant review page.
 *
 * This page renders the same `ApplicantsTab` component but with its own
 * page header so the top-nav navigation feels like a real destination, not
 * a tab swap inside another page.
 */
export default async function EmployerApplicantsPage() {
    await requireEmployer();

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !user.email) {
        redirect('/login?next=/employer/applicants');
    }

    return (
        <>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Employer Dashboard', url: 'https://pmhnphiring.com/employer/dashboard' },
                { name: 'Applicants', url: 'https://pmhnphiring.com/employer/applicants' },
            ]} />

            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '20px 16px 48px' }}>
                {/* Back-to-dashboard breadcrumb */}
                <Link
                    href="/employer/dashboard"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#6B7F8A',
                        textDecoration: 'none',
                        marginBottom: '16px',
                    }}
                >
                    <ArrowLeft size={14} />
                    Back to Dashboard
                </Link>

                {/* Page header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        marginBottom: '24px',
                    }}
                >
                    <div
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: 14,
                            background: '#F7FBF8',
                            border: '1px solid rgba(213, 232, 224, 0.5)',
                            boxShadow: '4px 4px 10px rgba(0, 60, 50, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#0D9488',
                            flexShrink: 0,
                        }}
                    >
                        <Users size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1
                            style={{
                                fontSize: '28px',
                                fontWeight: 800,
                                fontFamily: 'var(--font-lora), Georgia, serif',
                                color: '#1A2E35',
                                margin: '0 0 4px',
                                letterSpacing: '-0.5px',
                            }}
                        >
                            Applicants
                        </h1>
                        <p style={{ fontSize: '14px', color: '#8A9BA6', margin: 0 }}>
                            Candidates who have applied to your job postings.
                        </p>
                    </div>
                </div>

                <ApplicantsTab />
            </div>
        </>
    );
}
