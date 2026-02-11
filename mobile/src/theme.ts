import { StyleSheet } from 'react-native';

export const palette = {
    background: '#070b16',
    backgroundElevated: '#0e1628',
    backgroundPanel: '#111d33',
    backgroundMuted: '#17233a',
    border: '#253452',
    borderStrong: '#36527d',
    textPrimary: '#f8fbff',
    textSecondary: '#c2cde0',
    textMuted: '#8290ad',
    primary: '#3b82f6',
    primaryMuted: '#1d4ed8',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    accentCyan: '#22d3ee',
    accentViolet: '#a78bfa',
} as const;

export const spacing = {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
} as const;

export const radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
} as const;

export const appStyles = StyleSheet.create({
    page: {
        flex: 1,
        backgroundColor: palette.background,
    },
    pagePadding: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
    },
    card: {
        backgroundColor: palette.backgroundPanel,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: radius.lg,
        padding: spacing.md,
    },
    chip: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.backgroundMuted,
    },
    sectionTitle: {
        color: palette.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        marginBottom: spacing.sm,
    },
});

