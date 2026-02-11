'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    // Initialize theme from localStorage or system preference
    useEffect(() => {
        const stored = localStorage.getItem('theme') as Theme | null;
        if (stored === 'light' || stored === 'dark') {
            setTheme(stored);
        } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
            setTheme('light');
        } else {
            // Default to dark
            setTheme('dark');
        }
        setMounted(true);
    }, []);

    // Sync dark class + ALL CSS variables directly via JS
    // This bypasses Tailwind v4's CSS cascade issues completely
    useEffect(() => {
        if (!mounted) return;
        const root = document.documentElement;
        const s = root.style;

        if (theme === 'dark') {
            root.classList.add('dark');

            // Backgrounds
            s.setProperty('--bg-primary', '#060E18');
            s.setProperty('--bg-secondary', '#0F1923');
            s.setProperty('--bg-secondary-rgb', '15, 25, 35');
            s.setProperty('--bg-tertiary', '#162231');

            // Text
            s.setProperty('--text-primary', '#F1F5F9');
            s.setProperty('--text-primary-rgb', '241, 245, 249');
            s.setProperty('--text-secondary', '#94A3B8');
            s.setProperty('--text-tertiary', '#64748B');

            // Borders
            s.setProperty('--border-color', '#1E293B');
            s.setProperty('--border-color-dark', '#334155');

            // Shadows
            s.setProperty('--shadow-color', 'rgba(0, 0, 0, 0.4)');

            // Header / Nav
            s.setProperty('--header-bg', '#0B1320');
            s.setProperty('--mobile-menu-bg', '#0F1923');
            s.setProperty('--nav-btn-bg', '#162231');
            s.setProperty('--nav-btn-text', '#F1F5F9');
            s.setProperty('--nav-btn-hover-bg', '#1E293B');

            // Inputs
            s.setProperty('--input-text', '#F1F5F9');
            s.setProperty('--input-placeholder', '#64748B');

            // Selection
            s.setProperty('--selection-bg', '#134E4A');
            s.setProperty('--selection-text', '#CCFBF1');

            // Shimmer
            s.setProperty('--shimmer-from', '#162231');
            s.setProperty('--shimmer-via', '#1E293B');

            // Primary colors
            s.setProperty('--color-primary', '#2DD4BF');
            s.setProperty('--color-primary-dark', '#14B8A6');
            s.setProperty('--color-primary-light', '#5EEAD4');
            s.setProperty('--salary-color', '#2DD4BF');

            // Body
            document.body.style.backgroundColor = '#060E18';
            document.body.style.color = '#F1F5F9';
        } else {
            root.classList.remove('dark');

            // Backgrounds
            s.setProperty('--bg-primary', '#FFFFFF');
            s.setProperty('--bg-secondary', '#F9FAFB');
            s.setProperty('--bg-secondary-rgb', '249, 250, 251');
            s.setProperty('--bg-tertiary', '#F3F4F6');

            // Text
            s.setProperty('--text-primary', '#111827');
            s.setProperty('--text-primary-rgb', '17, 24, 39');
            s.setProperty('--text-secondary', '#374151');
            s.setProperty('--text-tertiary', '#6B7280');

            // Borders
            s.setProperty('--border-color', '#E5E7EB');
            s.setProperty('--border-color-dark', '#D1D5DB');

            // Shadows
            s.setProperty('--shadow-color', 'rgba(0, 0, 0, 0.1)');

            // Header / Nav
            s.setProperty('--header-bg', '#FFFFFF');
            s.setProperty('--mobile-menu-bg', '#FFFFFF');
            s.setProperty('--nav-btn-bg', '#F3F4F6');
            s.setProperty('--nav-btn-text', '#111827');
            s.setProperty('--nav-btn-hover-bg', '#E5E7EB');

            // Inputs
            s.setProperty('--input-text', '#111827');
            s.setProperty('--input-placeholder', '#6B7280');

            // Selection
            s.setProperty('--selection-bg', '#CCFBF1');
            s.setProperty('--selection-text', '#134E4A');

            // Shimmer
            s.setProperty('--shimmer-from', '#f0f0f0');
            s.setProperty('--shimmer-via', '#e0e0e0');

            // Primary colors
            s.setProperty('--color-primary', '#0D9488');
            s.setProperty('--color-primary-dark', '#0F766E');
            s.setProperty('--color-primary-light', '#14B8A6');
            s.setProperty('--salary-color', '#1d4ed8');

            // Body
            document.body.style.backgroundColor = '#FFFFFF';
            document.body.style.color = '#111827';
        }

        localStorage.setItem('theme', theme);
    }, [theme, mounted]);

    // Listen for system preference changes when no explicit choice is saved
    useEffect(() => {
        if (!mounted) return;
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!mq) return;

        const handler = (e: MediaQueryListEvent) => {
            const stored = localStorage.getItem('theme');
            if (!stored) {
                setTheme(e.matches ? 'dark' : 'light');
            }
        };

        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [mounted]);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
