import { Suspense } from 'react'
import { requireEmployer } from '@/lib/auth/protect'
import CandidateSearchClient from '@/components/employer/CandidateSearchClient'

export const metadata = {
    title: 'PMHNP Talent Pool | Browse Candidates',
    description: 'Browse qualified Psychiatric Mental Health Nurse Practitioners actively looking for new opportunities.',
}

export default async function CandidatesPage() {
    await requireEmployer()

    // Suspense wraps the client because CandidateSearchClient calls
    // useSearchParams() to honor the ?ai=1 deep-link from the talent-search
    // redirect stub. Next App Router requires the boundary explicitly.
    return (
        <Suspense fallback={null}>
            <CandidateSearchClient />
        </Suspense>
    )
}
