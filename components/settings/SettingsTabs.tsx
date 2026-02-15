'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    User, Award, GraduationCap, Briefcase, FolderOpen,
    ShieldCheck, MessageSquare, Users, Lock, Settings
} from 'lucide-react'

const TABS = [
    { key: 'personal', label: 'Personal', icon: User },
    { key: 'credentials', label: 'Credentials', icon: Award },
    { key: 'education', label: 'Education', icon: GraduationCap },
    { key: 'experience', label: 'Experience', icon: Briefcase },
    { key: 'documents', label: 'Documents', icon: FolderOpen },
    { key: 'screening', label: 'Screening', icon: ShieldCheck },
    { key: 'responses', label: 'Responses', icon: MessageSquare },
    { key: 'references', label: 'References', icon: Users },
    { key: 'account', label: 'Account', icon: Lock },
] as const

export type TabKey = typeof TABS[number]['key']

interface Props {
    activeTab: TabKey
    onTabChange: (tab: TabKey) => void
    isJobSeeker: boolean
}

export { TABS }

export default function SettingsTabs({ activeTab, onTabChange, isJobSeeker }: Props) {
    const visibleTabs = isJobSeeker ? TABS : TABS.filter(t => t.key === 'personal' || t.key === 'account')

    return (
        <div style={{
            display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px',
            borderBottom: '1px solid var(--border-color)', marginBottom: '24px',
            scrollbarWidth: 'none',
        }}>
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
                            padding: '10px 16px', fontSize: '13px', fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#2DD4BF' : 'var(--text-secondary)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            borderBottom: isActive ? '2px solid #2DD4BF' : '2px solid transparent',
                            transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                    >
                        <Icon size={16} />
                        {tab.label}
                    </button>
                )
            })}
        </div>
    )
}
