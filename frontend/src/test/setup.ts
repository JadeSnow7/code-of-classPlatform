// Test setup file for Vitest

const storage = new Map<string, string>();
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
let mediaMatches = false;

Object.defineProperty(globalThis, 'localStorage', {
    value: {
        getItem: (key: string) => (storage.has(key) ? storage.get(key) ?? null : null),
        setItem: (key: string, value: string) => {
            storage.set(key, value);
        },
        removeItem: (key: string) => {
            storage.delete(key);
        },
        clear: () => {
            storage.clear();
        },
    },
    writable: true,
});

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: mediaMatches,
        media: query,
        onchange: null,
        addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
            mediaListeners.add(listener);
        },
        removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
            mediaListeners.delete(listener);
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
            mediaListeners.add(listener);
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
            mediaListeners.delete(listener);
        },
        dispatchEvent: () => true,
    }),
});

Object.defineProperty(window, '__setMatchMediaDarkMode', {
    value: (matches: boolean) => {
        mediaMatches = matches;
        const event = { matches } as MediaQueryListEvent;
        mediaListeners.forEach((listener) => listener(event));
    },
    writable: true,
});
