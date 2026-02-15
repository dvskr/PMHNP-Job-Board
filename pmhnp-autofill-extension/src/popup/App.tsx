import { useState, useEffect, useCallback } from 'react';
import type { AuthState, ApplicationPageInfo, ProfileReadiness } from '@/shared/types';
import {
    getAuthState,
    requestLogin,
    requestLogout,
    refreshProfile,
    getProfileReadiness as fetchReadiness,
    checkApplicationPage,
    triggerAutofill,
} from '@/shared/messaging';
import { SETTINGS_URL, SIGNUP_URL } from '@/shared/constants';

type ViewState = 'loading' | 'logged_out' | 'logged_in' | 'on_application';

export default function App() {
    const [viewState, setViewState] = useState<ViewState>('loading');
    const [auth, setAuth] = useState<AuthState | null>(null);
    const [readiness, setReadiness] = useState<ProfileReadiness | null>(null);
    const [appInfo, setAppInfo] = useState<ApplicationPageInfo | null>(null);
    const [filling, setFilling] = useState(false);
    const [fillMessage, setFillMessage] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const init = useCallback(async () => {
        try {
            const authState = await getAuthState();
            setAuth(authState);

            if (!authState.isLoggedIn) {
                setViewState('logged_out');
                return;
            }

            // Check profile readiness
            try {
                const r = await fetchReadiness();
                setReadiness(r);
            } catch {
                // Profile might not be ready yet
            }

            // Check if on application page
            try {
                const info = await checkApplicationPage();
                setAppInfo(info);
                setViewState(info.isApplication ? 'on_application' : 'logged_in');
            } catch {
                setViewState('logged_in');
            }
        } catch {
            setViewState('logged_out');
        }
    }, []);

    useEffect(() => {
        init();
    }, [init]);

    const handleLogin = async () => {
        try {
            await requestLogin();
            await init();
        } catch (err) {
            console.error('Login failed:', err);
        }
    };

    const handleLogout = async () => {
        await requestLogout();
        setAuth(null);
        setReadiness(null);
        setAppInfo(null);
        setViewState('logged_out');
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshProfile();
            const r = await fetchReadiness();
            setReadiness(r);
        } catch (err) {
            console.error('Refresh failed:', err);
        } finally {
            setRefreshing(false);
        }
    };

    const handleAutofill = async () => {
        setFilling(true);
        setFillMessage('');
        try {
            await triggerAutofill();
            setFillMessage('Autofill complete! Open the review sidebar to verify.');
        } catch (err) {
            setFillMessage(`Autofill failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setFilling(false);
        }
    };

    if (viewState === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-[200px] bg-navy">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="bg-navy min-h-[200px] p-4 flex flex-col">
            {/* Header Logo */}
            <div className="flex items-center gap-2 mb-4">
                <div className="w-11 h-11 rounded-lg bg-white flex items-center justify-center p-0.5">
                    <img src="/logo.png" alt="PMHNP Hiring" className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="text-sm font-semibold text-white leading-tight">PMHNP Hiring</h1>
                    <p className="text-[10px] text-text-secondary leading-tight">Autofill Agent</p>
                </div>
            </div>

            {/* ─── STATE: Logged Out ─── */}
            {viewState === 'logged_out' && (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-4">
                    <p className="text-sm text-text-secondary">
                        Autofill PMHNP job applications in seconds
                    </p>
                    <button
                        onClick={handleLogin}
                        className="w-full py-2.5 px-4 bg-teal hover:bg-teal-hover text-navy font-semibold rounded-lg transition-all duration-200 text-sm"
                    >
                        Login to pmhnphiring.com
                    </button>
                    <a
                        href={SIGNUP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-text-secondary hover:text-teal transition-colors"
                    >
                        Don&apos;t have an account? Sign up free
                    </a>
                </div>
            )}

            {/* ─── STATE: Logged In (not on application page) ─── */}
            {viewState === 'logged_in' && auth?.user && (
                <div className="flex-1 flex flex-col gap-3">
                    <p className="text-base font-medium text-white">
                        Hi, {auth.user.firstName || 'there'}! 👋
                    </p>

                    {/* Profile completeness */}
                    {readiness && (
                        <div className="bg-navy-light rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs text-text-secondary">Profile completeness</span>
                                <span className="text-xs font-semibold text-teal">{readiness.completeness}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-navy-dark rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-teal rounded-full transition-all duration-500"
                                    style={{ width: `${readiness.completeness}%` }}
                                />
                            </div>
                            {readiness.missing.length > 0 && (
                                <p className="text-[10px] text-text-muted mt-1.5">
                                    Missing: {readiness.missing.slice(0, 3).join(', ')}
                                    {readiness.missing.length > 3 ? ` +${readiness.missing.length - 3} more` : ''}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => chrome.tabs.create({ url: SETTINGS_URL })}
                            className="flex-1 py-2 px-3 bg-navy-light hover:bg-navy-700 text-white text-xs font-medium rounded-lg transition-colors border border-border-color"
                        >
                            Profile Settings
                        </button>
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="flex-1 py-2 px-3 bg-navy-light hover:bg-navy-700 text-white text-xs font-medium rounded-lg transition-colors border border-border-color disabled:opacity-50"
                        >
                            {refreshing ? 'Refreshing...' : 'Refresh Data'}
                        </button>
                    </div>

                    <p className="text-[11px] text-text-muted text-center">
                        Navigate to a job application to start autofilling.
                        <button
                            onClick={async () => {
                                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                                if (tab?.id) {
                                    await chrome.tabs.reload(tab.id);
                                    window.close();
                                }
                            }}
                            className="block mx-auto mt-1 text-teal hover:underline text-[11px] font-medium"
                        >
                            Already on one? Click to reload page ↻
                        </button>
                    </p>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="self-center text-[11px] text-text-muted hover:text-error transition-colors mt-auto"
                    >
                        Log out
                    </button>
                </div>
            )}

            {/* ─── STATE: On Application Page ─── */}
            {viewState === 'on_application' && auth?.user && (
                <div className="flex-1 flex flex-col gap-3">
                    <p className="text-base font-medium text-white">
                        Hi, {auth.user.firstName || 'there'}! 👋
                    </p>

                    {/* Profile completeness (compact) */}
                    {readiness && (
                        <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-navy-dark rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-teal rounded-full"
                                    style={{ width: `${readiness.completeness}%` }}
                                />
                            </div>
                            <span className="text-xs text-teal font-medium">{readiness.completeness}%</span>
                        </div>
                    )}

                    {/* ATS Detection */}
                    {appInfo && (
                        <div className="bg-navy-light rounded-lg p-2.5 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
                            <span className="text-xs text-text-secondary">
                                {appInfo.atsName
                                    ? `Detected: ${appInfo.atsName} application`
                                    : 'Unknown application form — using generic autofill'}
                            </span>
                            {appInfo.fieldCount > 0 && (
                                <span className="text-xs text-text-muted ml-auto">{appInfo.fieldCount} fields</span>
                            )}
                        </div>
                    )}

                    {/* Big Autofill Button */}
                    <button
                        onClick={handleAutofill}
                        disabled={filling}
                        className="w-full py-3 px-4 bg-teal hover:bg-teal-hover text-navy font-bold rounded-lg transition-all duration-200 text-sm flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-teal/20"
                    >
                        {filling ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-navy border-t-transparent" />
                                Filling...
                            </>
                        ) : (
                            <>
                                <span>✨</span>
                                Autofill This Application
                            </>
                        )}
                    </button>

                    {/* Fill message */}
                    {fillMessage && (
                        <p className={`text-xs text-center ${fillMessage.includes('failed') ? 'text-error' : 'text-success'}`}>
                            {fillMessage}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="flex-1 py-1.5 px-3 bg-navy-light text-white text-[11px] rounded-lg border border-border-color disabled:opacity-50"
                        >
                            {refreshing ? '...' : 'Refresh Data'}
                        </button>
                        <button
                            onClick={() => chrome.tabs.create({ url: SETTINGS_URL })}
                            className="flex-1 py-1.5 px-3 bg-navy-light text-white text-[11px] rounded-lg border border-border-color"
                        >
                            Settings
                        </button>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="self-center text-[11px] text-text-muted hover:text-error transition-colors"
                    >
                        Log out
                    </button>
                </div>
            )}
        </div>
    );
}
