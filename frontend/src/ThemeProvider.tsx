/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useLayoutEffect, useState, useMemo, type ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { getAntdThemeConfig, type ResolvedTheme } from './styles/themeConfig';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
    mode: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getSavedThemeMode(): ThemeMode | null {
    if (typeof window === 'undefined') return null;
    try {
        const saved = window.localStorage.getItem('theme-mode');
        if (saved === 'system' || saved === 'light' || saved === 'dark') {
            return saved as ThemeMode;
        }
    } catch {
        // Ignore storage access failures.
    }
    return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>(() => {
        const saved = getSavedThemeMode();
        if (saved) return saved;
        return 'system';
    });

    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

    useEffect(() => {
        try {
            window.localStorage.setItem('theme-mode', mode);
        } catch {
            // Ignore storage access failures.
        }
    }, [mode]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (event?: MediaQueryListEvent) => {
            setSystemTheme((event?.matches ?? media.matches) ? 'dark' : 'light');
        };

        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onChange);
            return () => media.removeEventListener('change', onChange);
        }

        if (media.addListener) {
            media.addListener(onChange);
            return () => media.removeListener(onChange);
        }

        return undefined;
    }, []);

    const resolvedTheme = mode === 'system' ? systemTheme : mode;

    useLayoutEffect(() => {
        const root = document.documentElement;

        root.classList.toggle('dark', resolvedTheme === 'dark');
        root.style.colorScheme = resolvedTheme;
        document.body.style.backgroundColor = resolvedTheme === 'dark' ? '#0F172A' : '#FFFFFF';
    }, [resolvedTheme]);

    const config = useMemo(() => getAntdThemeConfig(resolvedTheme), [resolvedTheme]);

    return (
        <ThemeContext.Provider value={{ mode, resolvedTheme, setMode }}>
            <ConfigProvider theme={config} locale={zhCN}>
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return ctx;
}
