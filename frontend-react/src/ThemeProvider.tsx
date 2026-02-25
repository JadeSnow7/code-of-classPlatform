import React, { createContext, useContext, useEffect, useState } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { usePlatform } from '../hooks/usePlatform';

type ThemeMode = 'system' | 'desktop' | 'mobile' | 'custom';

interface ThemeContextType {
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    primaryColor: string;
    setPrimaryColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { isDesktop, isMobile } = usePlatform();

    const [mode, setMode] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem('theme-mode');
        return (saved as ThemeMode) || 'system';
    });

    const [customColor, setCustomColor] = useState(() => {
        return localStorage.getItem('theme-custom-color') || '#2563EB';
    });

    // Determine actual primary color based on mode and platform
    const primaryColor = React.useMemo(() => {
        if (mode === 'custom') return customColor;
        if (mode === 'desktop' || (mode === 'system' && isDesktop)) return '#2563EB'; // Blue
        if (mode === 'mobile' || (mode === 'system' && isMobile)) return '#8B5CF6'; // Violet/Purple
        return '#2563EB'; // Default fallback
    }, [mode, customColor, isDesktop, isMobile]);

    useEffect(() => {
        localStorage.setItem('theme-mode', mode);
    }, [mode]);

    useEffect(() => {
        localStorage.setItem('theme-custom-color', customColor);
    }, [customColor]);

    // Apply CSS variables to root for Tailwind/Custom CSS usage
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--primary-color', primaryColor);

        // Add theme class for other potential CSS overrides
        root.classList.remove('theme-desktop', 'theme-mobile');
        if (primaryColor === '#2563EB') root.classList.add('theme-desktop');
        else if (primaryColor === '#8B5CF6') root.classList.add('theme-mobile');

    }, [primaryColor]);

    const antdTheme = {
        token: {
            colorPrimary: primaryColor,
            colorInfo: primaryColor,
            colorSuccess: '#10B981',
            colorWarning: '#F59E0B',
            colorError: '#EF4444',
            borderRadius: 10,
            fontFamily: 'Inter, system-ui, sans-serif',
        },
        components: {
            Layout: {
                siderBg: '#0F172A',
                triggerBg: '#1E293B',
            },
            Menu: {
                darkItemBg: '#0F172A',
                darkItemSelectedBg: `${primaryColor}33`, // Append 33 for 20% opacity hex
                darkItemColor: '#94A3B8',
                darkItemSelectedColor: primaryColor,
            },
            Button: {
                colorPrimary: primaryColor,
            }
        },
    };

    return (
        <ThemeContext.Provider value={{ mode, setMode, primaryColor: customColor, setPrimaryColor: setCustomColor }}>
            <ConfigProvider theme={antdTheme} locale={zhCN}>
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
}
