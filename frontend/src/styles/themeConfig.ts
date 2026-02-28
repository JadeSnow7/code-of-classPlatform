import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

export type ResolvedTheme = 'light' | 'dark';

export function getAntdThemeConfig(resolvedTheme: ResolvedTheme): ThemeConfig {
    const isDark = resolvedTheme === 'dark';

    return {
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
            colorPrimary: '#2563EB',
            colorInfo: '#2563EB',
            colorSuccess: '#16A34A',
            colorWarning: '#F59E0B',
            colorError: '#EF4444',
            colorBgBase: isDark ? '#0F172A' : '#FFFFFF',
            colorTextBase: isDark ? '#F8FAFC' : '#0F172A',
            fontFamily:
                "'SF Pro Display', 'SF Pro Text', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
            borderRadius: 10,
            wireframe: false,
        },
        components: {
            Layout: {
                bodyBg: isDark ? '#0F172A' : '#FFFFFF',
                siderBg: isDark ? '#020617' : '#F8FAFC',
            },
            Menu: {
                itemBg: 'transparent',
                subMenuItemBg: 'transparent',
                itemBorderRadius: 10,
                itemHoverBg: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(226, 232, 240, 0.7)',
                itemSelectedBg: isDark ? 'rgba(37, 99, 235, 0.18)' : 'rgba(37, 99, 235, 0.10)',
                itemSelectedColor: isDark ? '#BFDBFE' : '#1D4ED8',
                darkItemBg: 'transparent',
                darkSubMenuItemBg: 'transparent',
                darkItemSelectedBg: 'rgba(37, 99, 235, 0.18)',
                darkItemSelectedColor: '#BFDBFE',
            },
            Card: {
                colorBgContainer: isDark ? 'rgba(15, 23, 42, 0.82)' : '#FFFFFF',
                colorBorderSecondary: isDark ? '#1E293B' : '#E2E8F0',
            },
        },
    };
}
