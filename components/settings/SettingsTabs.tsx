'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    User, Award, GraduationCap, Briefcase,
    ShieldCheck, MessageSquare, Users, Lock, Settings,
    Building, CreditCard, Bell
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

    return (
        <div style={{ position: 'relative', marginBottom: '24px' }}>
            <div
                className="settings-tabs-scroll"
                style={{
                    display: 'flex', gap: '2px', overflowX: 'auto', paddingBottom: '6px',
                    borderBottom: '1px solid var(--border-color)',
                    scrollbarWidth: 'auto',
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                <style>{`
                    .settings-tabs-scroll::-webkit-scrollbar { height: 6px; }
                    .settings-tabs-scroll::-webkit-scrollbar-track { background: var(--bg-tertiary, #1a1a2e); border-radius: 3px; }
                    .settings-tabs-scroll::-webkit-scrollbar-thumb { background: rgba(45,212,191,0.4); border-radius: 3px; }
                    .settings-tabs-scroll::-webkit-scrollbar-thumb:hover { background: rgba(45,212,191,0.7); }
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
