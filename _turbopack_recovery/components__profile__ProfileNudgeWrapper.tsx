'use client'

import dynamic from 'next/dynamic'

const ProfileNudgeBanner = dynamic(
    () => import('@/components/profile/ProfileNudgeBanner'),
    { ssr: false }
)

export default function ProfileNudgeWrapper() {
    return <ProfileNudgeBanner />
}
