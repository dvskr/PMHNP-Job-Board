import { useState, useEffect, useCallback } from 'react';
import type { ExtensionSettings } from '@/shared/types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@/shared/constants';
import { getSettings } from '@/shared/storage';

type SettingsSection = 'general' | 'autofill' | 'ai' | 'about';

export default function Settings() {
    const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
    const [activeSection, setActiveSection] = useState<SettingsSection>('general');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        getSettings().then(setSettings);
    }, []);

    const saveSettings = useCallback(async (updated: ExtensionSettings) => {
        setSettings(updated);
        await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    }, []);

    const updateSetting = useCallback(<K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
        const updated = { ...settings, [key]: value };
        saveSettings(updated);
    }, [settings, saveSettings]);

    const sections: { key: SettingsSection; label: string; icon: string }[] = [
        { key: 'general', label: 'General', icon: '⚙️' },
        { key: 'autofill', label: 'Autofill', icon: '📝' },
        { key: 'ai', label: 'AI', icon: '🤖' },
        { key: 'about', label: 'About', icon: 'ℹ️' },
    ];

    return (
        <div className="min-h-screen bg-navy text-white">
            {/* Header */}
            <div className="p-4 border-b border-border-color flex items-center gap-3">
                <button
                    onClick={() => window.close()}
                    className="text-text-muted hover:text-white transition-colors"
                >
                    ←
                </button>
                <h1 className="text-lg font-semibold">Settings</h1>
                {saved && (
                    <span className="ml-auto text-xs text-success animate-pulse">✓ Saved</span>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-color">
                {sections.map((section) => (
                    <button
                        key={section.key}
                        onClick={() => setActiveSection(section.key)}
                        className={`flex-1 py-3 px-2 text-xs font-medium transition-colors relative ${activeSection === section.key
                                ? 'text-white'
                                : 'text-text-muted hover:text-text-secondary'
                            }`}
                    >
                        <span className="mr-1">{section.icon}</span> {section.label}
                        {activeSection === section.key && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal" />
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {activeSection === 'general' && (
                    <>
                        <ToggleSetting
                            label="Show floating button (FAB)"
                            description="Show the autofill button on job application pages"
                            checked={settings.showFAB}
                            onChange={(v) => updateSetting('showFAB', v)}
                        />
                        <ToggleSetting
                            label="Auto-detect applications"
                            description="Automatically detect when you're on a job application"
                            checked={settings.autoDetectApplications}
                            onChange={(v) => updateSetting('autoDetectApplications', v)}
                        />
                        <ToggleSetting
                            label="Auto-open review sidebar"
                            description="Show the review sidebar after autofill completes"
                            checked={settings.autoOpenReviewSidebar}
                            onChange={(v) => updateSetting('autoOpenReviewSidebar', v)}
                        />
                    </>
                )}

                {activeSection === 'autofill' && (
                    <>
                        <SelectSetting
                            label="Fill speed"
                            description="How fast fields are filled"
                            value={settings.fillSpeed}
                            options={[
                                { value: 'fast', label: 'Fast' },
                                { value: 'normal', label: 'Normal' },
                                { value: 'careful', label: 'Careful' },
                            ]}
                            onChange={(v) => updateSetting('fillSpeed', v as ExtensionSettings['fillSpeed'])}
                        />
                        <ToggleSetting
                            label="Overwrite existing values"
                            description="Replace values already filled in form fields"
                            checked={settings.overwriteExistingValues}
                            onChange={(v) => updateSetting('overwriteExistingValues', v)}
                        />
                        <ToggleSetting
                            label="Auto-attach resume"
                            description="Automatically attach your resume to file inputs"
                            checked={settings.autoAttachResume}
                            onChange={(v) => updateSetting('autoAttachResume', v)}
                        />
                        <ToggleSetting
                            label="Auto-attach other documents"
                            description="Automatically attach licenses, certs, etc."
                            checked={settings.autoAttachOtherDocs}
                            onChange={(v) => updateSetting('autoAttachOtherDocs', v)}
                        />
                    </>
                )}

                {activeSection === 'ai' && (
                    <>
                        <ToggleSetting
                            label="Enable AI answers"
                            description="Use AI to generate answers for open-ended questions"
                            checked={settings.useAIForOpenEnded}
                            onChange={(v) => updateSetting('useAIForOpenEnded', v)}
                        />
                        <SelectSetting
                            label="Response length"
                            description="Default length for AI-generated answers"
                            value={settings.aiResponseLength}
                            options={[
                                { value: 'brief', label: 'Brief (~150 chars)' },
                                { value: 'standard', label: 'Standard (~300 chars)' },
                                { value: 'detailed', label: 'Detailed (~500 chars)' },
                            ]}
                            onChange={(v) => updateSetting('aiResponseLength', v as ExtensionSettings['aiResponseLength'])}
                        />
                        <ToggleSetting
                            label="Always review AI answers"
                            description="Require manual approval before submitting AI-generated answers"
                            checked={settings.alwaysReviewAI}
                            onChange={(v) => updateSetting('alwaysReviewAI', v)}
                        />
                    </>
                )}

                {activeSection === 'about' && (
                    <div className="space-y-3">
                        <div className="bg-navy-light rounded-lg p-4 border border-border-color">
                            <h3 className="font-semibold text-white mb-2">PMHNP Autofill</h3>
                            <p className="text-xs text-text-secondary">Version 1.0.0</p>
                            <p className="text-xs text-text-secondary mt-1">
                                Automatically fill job applications with your PMHNP profile data.
                            </p>
                        </div>
                        <a
                            href="https://pmhnphiring.com/settings"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-navy-light rounded-lg p-4 border border-border-color hover:border-teal transition-colors"
                        >
                            <p className="text-sm text-white">Manage Profile</p>
                            <p className="text-xs text-text-secondary mt-0.5">
                                Update your profile data on pmhnphiring.com
                            </p>
                        </a>
                        <a
                            href="https://pmhnphiring.com/support"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-navy-light rounded-lg p-4 border border-border-color hover:border-teal transition-colors"
                        >
                            <p className="text-sm text-white">Help & Support</p>
                            <p className="text-xs text-text-secondary mt-0.5">
                                Get help or report issues
                            </p>
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Sub-components ───

function ToggleSetting({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-3 py-2">
            <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-text-secondary mt-0.5">{description}</p>
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${checked ? 'bg-teal' : 'bg-navy-dark'
                    }`}
            >
                <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''
                        }`}
                />
            </button>
        </div>
    );
}

function SelectSetting({
    label,
    description,
    value,
    options,
    onChange,
}: {
    label: string;
    description: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}) {
    return (
        <div className="py-2">
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-text-secondary mt-0.5 mb-2">{description}</p>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-navy-dark border border-border-color rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal transition-colors"
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
