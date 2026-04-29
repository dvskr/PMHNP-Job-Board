import { requireEmployer } from '@/lib/auth/protect'
import CandidateProfileClient from '@/components/employer/CandidateProfileClient'

export const metadata = {
    title: 'Candidate Profile',
}

export default async function CandidateDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    await requireEmployer()
    const { id } = await params

    return <CandidateProfileClient candidateId={id} />
}
