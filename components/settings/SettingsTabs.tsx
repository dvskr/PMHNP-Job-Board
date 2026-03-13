'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    User, Award, GraduationCap, Briefcase,
    ShieldCheck, MessageSquare, Users, Lock, Settings,
    Building, CreditCard, Bell, ChevronLeft, ChevronRight
} from 'lucide-react'

const JOB_SEEKER_TABS = [
    { key: 'personal', label: 'Personal', icon: User },
    { key: 'credentials', label: 'Credentials', icon: Award },
    { key: 'education', label: 'Education', icon: GraduationCap },
    { key: 'experience', label: 'Experience', icon: Briefcase },
    { key: 'screening', label: 'Screening', icon: ShieldCheck },
    { key: 'responses', label: 'Responses', icon: MessageSquare },
    { key: 'references', label: 'References', icon: Users },
    { key: 'account', label: 'Account', icon: Lock },
] as const

const EMPLOYER_TABS = [
    { key: 'personal', label: 'Personal', icon: User },
    { key: 'company', label: 'Company', icon: Building },
    { key: 'billing', label: 'Billing', icon: CreditCard },
    { key: 'alerts', label: 'Alerts', icon: Bell },
    { key: 'account', label: 'Account', icon: Lock },
] as const

// Union of all possible tab keys
export type TabKey = typeof JOB_SEEKER_TABS[number]['key'] | typeof EMPLOYER_TABS[number]['key']

interface Props {
    activeTab: TabKey
    onTabChange: (tab: TabKey) => void
    isJobSeeker: boolean
}

export { JOB_SEEKER_TABS, EMPLOYER_TABS }
// Keep TABS export for backward compat
export const TABS = JOB_SEEKER_TABS

export default function SettingsTabs({ activeTab, onTabChange, isJobSeeker }: Props) {
    const visibleTabs = isJobSeeker ? JOB_SEEKER_TABS : EMPLOYER_TABS
    const scrollRef = useRef<HTMLDivElement>(null)
    const [showLeft, setShowLeft] = useState(false)
    const [showRight, setShowRight] = useState(false)

    const checkScroll = () => {
        const el = scrollRef.current
        if (!el) return
        setShowLeft(el.scrollLeft > 4)
        setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }

    useEffect(() => {
        checkScroll()
        window.addEventListener('resize', checkScroll)
        return () => window.removeEventListener('resize', checkScroll)
    }, [])

    const scroll = (dir: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -150 : 150, behavior: 'smooth' })
    }

    return (
        <div style={{ position: 'relative', marginBottom: '24px' }}>
            {/* Left fade + arrow */}
            {showLeft && (
                <button
                    onClick={() => scroll('left')}
                    aria-label="Scroll tabs left"
                    style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 2,
                        width: '32px', border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(90deg, var(--bg-primary, #0a0f1a) 40%, transparent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#2DD4BF',
                    }}
                >
                    <ChevronLeft size={16} />
                </button>
            )}
            {/* Right fade + arrow */}
            {showRight && (
                <button
                    onClick={() => scroll('right')}
                    aria-label="Scroll tabs right"
                    style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 2,
                        width: '32px', border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(270deg, var(--bg-primary, #0a0f1a) 40%, transparent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#2DD4BF',
                    }}
                >
                    <ChevronRight size={16} />
                </button>
            )}

            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className="settings-tabs-scroll-v2"
                style={{
                    display: 'flex', gap: '2px', overflowX: 'auto', paddingBottom: '6px',
                    borderBottom: '1px solid var(--border-color)',
                    scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                <style>{`
                    .settings-tabs-scroll-v2::-webkit-scrollbar { display: none; }
                `}</style>
                {visibleTabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.key
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => onTabChange(tab.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '10px 12px', fontSize: '13px', fontWeight: isActive ? 700 : 500,
                                color: isActive ? '#2DD4BF' : 'var(--text-secondary)',
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderBottom: isActive ? '2px solid #2DD4BF' : '2px solid transparent',
                                transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
                            }}
                        >
                            <Icon size={15} />
                            {tab.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
