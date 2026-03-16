import { requireEmployer } from '@/lib/auth/protect'
import CandidateSearchClient from '@/components/employer/CandidateSearchClient'

export const metadata = {
    title: 'PMHNP Talent Pool | Browse Candidates',
    description: 'Browse qualified Psychiatric Mental Health Nurse Practitioners actively looking for new opportunities.',
}

export default async function CandidatesPage() {
    await requireEmployer()

    return <CandidateSearchClient />
}
