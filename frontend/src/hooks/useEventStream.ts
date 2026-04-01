import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/domains/auth/useAuth';

export interface NotificationEvent {
    type: string;
    payload: Record<string, unknown>;
}

export interface NotificationState {
    /** Unread announcement count incremented by push events */
    unreadAnnouncements: number;
    /** Most recent raw event received */
    lastEvent: NotificationEvent | null;
    /** Whether the SSE connection is live */
    connected: boolean;
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

/**
 * Connects to GET /api/v1/events and maintains a live notification state.
 * Reconnects automatically with exponential back-off on failure.
 */
export function useEventStream(): NotificationState {
    const { token, isAuthenticated } = useAuth();
    const [state, setState] = useState<NotificationState>({
        unreadAnnouncements: 0,
        lastEvent: null,
        connected: false,
    });
    const retryDelay = useRef(1000);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        let cancelled = false;

        async function connect() {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const res = await fetch(`${BASE_URL}/events`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });

                if (!res.ok || !res.body) {
                    throw new Error(`SSE connect failed: ${res.status}`);
                }

                setState(s => ({ ...s, connected: true }));
                retryDelay.current = 1000;

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || cancelled) break;

                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split('\n\n');
                    buffer = parts.pop() ?? '';

                    for (const part of parts) {
                        let eventType = 'message';
                        let data = '';
                        for (const line of part.split('\n')) {
                            if (line.startsWith('event:')) eventType = line.slice(6).trim();
                            if (line.startsWith('data:')) data = line.slice(5).trim();
                        }
                        if (!data || eventType === 'heartbeat') continue;
                        try {
                            const payload = JSON.parse(data) as Record<string, unknown>;
                            const event: NotificationEvent = { type: eventType, payload };
                            setState(s => ({
                                ...s,
                                lastEvent: event,
                                unreadAnnouncements:
                                    eventType === 'announcement.new'
                                        ? s.unreadAnnouncements + 1
                                        : s.unreadAnnouncements,
                            }));
                        } catch {
                            // malformed event — skip
                        }
                    }
                }
            } catch (err) {
                if (cancelled) return;
                if ((err as Error).name === 'AbortError') return;
                setState(s => ({ ...s, connected: false }));
                // Exponential back-off, capped at 30 s
                timeoutRef.current = setTimeout(() => {
                    if (!cancelled) {
                        retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
                        void connect();
                    }
                }, retryDelay.current);
            }
        }

        void connect();

        return () => {
            cancelled = true;
            abortRef.current?.abort();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setState(s => ({ ...s, connected: false }));
        };
    }, [isAuthenticated, token]);

    return state;
}
