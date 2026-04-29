'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme] = useState<Theme>('light');

    // No-op for toggleTheme since we are Light Mode only for Diorama aesthetic
    const toggleTheme = useCallback(() => {
        console.log('Dark mode is disabled for the Diorama rebrand.');
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
