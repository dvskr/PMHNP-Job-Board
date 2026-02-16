'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    User, Award, GraduationCap, Briefcase,
    ShieldCheck, MessageSquare, Users, Lock, Settings
} from 'lucide-react'

const TABS = [
    { key: 'personal', label: 'Personal', icon: User },
    { key: 'credentials', label: 'Credentials', icon: Award },
    { key: 'education', label: 'Education', icon: GraduationCap },
    { key: 'experience', label: 'Experience', icon: Briefcase },
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
        <div style={{ position: 'relative', marginBottom: '24px' }}>
            {/* Fade hint on the right */}
            <div style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px',
                background: 'linear-gradient(to left, var(--bg-primary, #fff) 0%, transparent 100%)',
                pointerEvents: 'none', zIndex: 1,
            }} />
            <div
                className="settings-tabs-scroll"
                style={{
                    display: 'flex', gap: '2px', overflowX: 'auto', paddingBottom: '2px',
                    borderBottom: '1px solid var(--border-color)',
                    scrollbarWidth: 'thin',
                    WebkitOverflowScrolling: 'touch',
                    paddingRight: '40px',
                }}
            >
                <style>{`
                    .settings-tabs-scroll::-webkit-scrollbar { height: 3px; }
                    .settings-tabs-scroll::-webkit-scrollbar-track { background: transparent; }
                    .settings-tabs-scroll::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
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
