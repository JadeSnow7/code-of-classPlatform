import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export type CloudAiHealthStatus = 'checking' | 'ready' | 'degraded' | 'offline';

type CloudAiHealthResponse = {
    status?: string;
    detail?: string;
    message?: string;
};

export type CloudAiHealthSnapshot = {
    status: CloudAiHealthStatus;
    title: string;
    detail: string;
};

const DEFAULT_DETAIL = '平台服务链路状态';

function normalizeStatus(raw: string | undefined): CloudAiHealthStatus {
    switch (raw) {
        case 'ok':
        case 'ready':
            return 'ready';
        case 'offline':
            return 'offline';
        case 'checking':
            return 'checking';
        default:
            return 'degraded';
    }
}

function snapshotFor(status: CloudAiHealthStatus, detail?: string): CloudAiHealthSnapshot {
    switch (status) {
        case 'ready':
            return {
                status,
                title: '云端 AI 可用',
                detail: detail || DEFAULT_DETAIL,
            };
        case 'offline':
            return {
                status,
                title: '云端 AI 不可用',
                detail: detail || DEFAULT_DETAIL,
            };
        case 'degraded':
            return {
                status,
                title: '云端 AI 降级',
                detail: detail || DEFAULT_DETAIL,
            };
        default:
            return {
                status: 'checking',
                title: '云端 AI 检测中',
                detail: detail || DEFAULT_DETAIL,
            };
    }
}

export function useCloudAiHealth() {
    const [state, setState] = useState<CloudAiHealthSnapshot>(() =>
        snapshotFor(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'checking'),
    );

    useEffect(() => {
        let cancelled = false;

        const probe = async () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                if (!cancelled) {
                    setState(snapshotFor('offline', '浏览器当前离线，无法访问云端 AI。'));
                }
                return;
            }

            if (!cancelled) {
                setState(snapshotFor('checking'));
            }

            try {
                const payload = await apiClient.get<CloudAiHealthResponse>('/ai/health');
                if (cancelled) return;

                const detail =
                    payload.detail ||
                    payload.message ||
                    (normalizeStatus(payload.status) === 'ready'
                        ? '云端 AI 与模型上游链路正常。'
                        : DEFAULT_DETAIL);
                setState(snapshotFor(normalizeStatus(payload.status), detail));
            } catch (error) {
                if (cancelled) return;
                const detail = error instanceof Error ? error.message : '云端 AI 健康探测失败。';
                setState(snapshotFor('degraded', detail));
            }
        };

        const handleOnline = () => {
            void probe();
        };
        const handleOffline = () => {
            setState(snapshotFor('offline', '浏览器当前离线，无法访问云端 AI。'));
        };

        void probe();
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const timer = window.setInterval(() => {
            void probe();
        }, 30000);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return state;
}
