import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '@/ThemeProvider';

function ThemeProbe() {
    const { mode, resolvedTheme, setMode } = useTheme();

    return (
        <div>
            <span>{`${mode}:${resolvedTheme}`}</span>
            <button type="button" onClick={() => setMode('dark')}>
                Dark
            </button>
            <button type="button" onClick={() => setMode('light')}>
                Light
            </button>
        </div>
    );
}

describe('ThemeProvider', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.className = '';
        document.documentElement.style.colorScheme = '';
        document.body.style.backgroundColor = '';
        (window as typeof window & { __setMatchMediaDarkMode: (matches: boolean) => void }).__setMatchMediaDarkMode(
            false,
        );
    });

    it('follows the system theme and reacts to media changes', () => {
        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        );

        expect(screen.getByText('system:light')).toBeTruthy();
        expect(document.documentElement.classList.contains('dark')).toBe(false);

        act(() => {
            (window as typeof window & { __setMatchMediaDarkMode: (matches: boolean) => void }).__setMatchMediaDarkMode(
                true,
            );
        });

        expect(screen.getByText('system:dark')).toBeTruthy();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('persists manual overrides to localStorage', () => {
        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
        expect(localStorage.getItem('theme-mode')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Light' }));
        expect(localStorage.getItem('theme-mode')).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});
