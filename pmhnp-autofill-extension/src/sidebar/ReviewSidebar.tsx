import { useState, useEffect } from 'react';
import type { FillResult, FillDetail } from '@/shared/types';

type Tab = 'filled' | 'skipped' | 'failed' | 'ai';

export default function ReviewSidebar() {
    const [result, setResult] = useState<FillResult | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('filled');

    useEffect(() => {
        // Listen for autofill results from content script
        const listener = (message: { type: string; payload?: FillResult }) => {
            if (message.type === 'AUTOFILL_COMPLETE' && message.payload) {
                setResult(message.payload);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, []);

    if (!result) {
        return (
            <div className="flex items-center justify-center h-screen bg-navy p-6">
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy-light flex items-center justify-center">
                        <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-teal">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-white mb-2">Review Panel</h2>
                    <p className="text-sm text-text-secondary">
                        Run autofill to review the filled fields here.
                    </p>
                </div>
            </div>
        );
    }

    const filled = result.details.filter((d) => d.status === 'filled');
    const skipped = result.details.filter((d) => d.status === 'skipped');
    const failed = result.details.filter((d) => d.status === 'failed' || d.status === 'needs_review');
    const needsAI = result.details.filter((d) => d.field.requiresAI);

    const tabs: { key: Tab; label: string; count: number; color: string }[] = [
        { key: 'filled', label: 'Filled', count: filled.length, color: 'text-success' },
        { key: 'skipped', label: 'Skipped', count: skipped.length, color: 'text-warning' },
        { key: 'failed', label: 'Issues', count: failed.length, color: 'text-error' },
        { key: 'ai', label: 'AI', count: needsAI.length, color: 'text-teal' },
    ];

    const getActiveDetails = (): FillDetail[] => {
        switch (activeTab) {
            case 'filled': return filled;
            case 'skipped': return skipped;
            case 'failed': return failed;
            case 'ai': return needsAI;
        }
    };

    return (
        <div className="h-screen bg-navy flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border-color">
                <h2 className="text-lg font-semibold text-white">Autofill Review</h2>
                <p className="text-xs text-text-secondary mt-1">
                    {result.filled}/{result.total} fields filled
                </p>
                {/* Progress bar */}
                <div className="w-full h-2 bg-navy-dark rounded-full mt-2 overflow-hidden">
                    <div
                        className="h-full bg-teal rounded-full transition-all duration-500"
                        style={{ width: `${(result.filled / Math.max(result.total, 1)) * 100}%` }}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-color">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 py-2 px-2 text-xs font-medium transition-colors relative ${activeTab === tab.key ? 'text-white' : 'text-text-muted hover:text-text-secondary'
                            }`}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={`ml-1 ${tab.color}`}>({tab.count})</span>
                        )}
                        {activeTab === tab.key && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal" />
                        )}
                    </button>
                ))}
            </div>

            {/* Detail list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {getActiveDetails().length === 0 ? (
                    <p className="text-sm text-text-muted text-center py-8">No items</p>
                ) : (
                    getActiveDetails().map((detail, i) => (
                        <div
                            key={i}
                            className="bg-navy-light rounded-lg p-3 border border-border-color"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-white truncate">
                                        {detail.field.field.label || detail.field.field.identifier || detail.field.profileKey}
                                    </p>
                                    {detail.field.value && (
                                        <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                                            {String(detail.field.value).substring(0, 60)}
                                        </p>
                                    )}
                                    {detail.error && (
                                        <p className="text-[10px] text-error mt-0.5">{detail.error}</p>
                                    )}
                                </div>
                                <div className="flex-shrink-0">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${detail.status === 'filled' ? 'bg-success/20 text-success' :
                                            detail.status === 'skipped' ? 'bg-warning/20 text-warning' :
                                                detail.status === 'needs_review' ? 'bg-teal/20 text-teal' :
                                                    'bg-error/20 text-error'
                                        }`}>
                                        {detail.status}
                                    </span>
                                </div>
                            </div>
                            {/* Confidence indicator */}
                            <div className="mt-1.5 flex items-center gap-1.5">
                                <div className="flex-1 h-0.5 bg-navy-dark rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${detail.field.confidence > 0.8 ? 'bg-success' :
                                                detail.field.confidence > 0.5 ? 'bg-warning' :
                                                    'bg-error'
                                            }`}
                                        style={{ width: `${detail.field.confidence * 100}%` }}
                                    />
                                </div>
                                <span className="text-[9px] text-text-muted">
                                    {Math.round(detail.field.confidence * 100)}%
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
