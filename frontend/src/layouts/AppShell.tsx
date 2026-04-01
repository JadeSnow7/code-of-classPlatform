import { Suspense, useMemo, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Typography } from 'antd';
import {
    BellOutlined,
    BookOutlined,
    ExperimentOutlined,
    RocketOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import clsx from 'clsx';
import { Brain } from 'lucide-react';
import { useTheme } from '@/ThemeProvider';
import { useAiConfigStore } from '@/domains/ai/useAiConfigStore';
import { useCloudAiHealth } from '@/hooks/useCloudAiHealth';
import { useMobile } from '@/hooks/useMobile';
import { useEventStream } from '@/hooks/useEventStream';

const { Text } = Typography;

type NavItem = {
    key: string;
    label: string;
    icon: ReactNode;
    badge?: number;
    isLocalAi?: boolean;
};

const navItems: NavItem[] = [
    { key: '/learning', label: '学习', icon: <BookOutlined /> },
    { key: '/courses', label: '课程', icon: <RocketOutlined /> },
    { key: '/local-ai', label: 'Local AI', icon: <Brain size={16} strokeWidth={2.1} />, isLocalAi: true },
    { key: '/workspace', label: '工作台', icon: <ExperimentOutlined /> },
];

const localStatusText = {
    ready: '本地 NPU 就绪',
    downloading: '本地 NPU 下载中',
    not_downloaded: '本地 NPU 未启用',
    error: '本地 NPU 异常',
} as const;

function ShellIconButton({
    onClick,
    children,
}: {
    onClick?: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
        >
            {children}
        </button>
    );
}

function ShellOutletFallback() {
    return (
        <div className="flex min-h-[32vh] items-center justify-center px-4 py-10">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/92 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/92 dark:text-slate-200">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-300" />
                正在加载内容...
            </div>
        </div>
    );
}

export function AppShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const isMobile = useMobile();
    const { resolvedTheme } = useTheme();
    const localModelStatus = useAiConfigStore((state) => state.localModelStatus);
    const cloudHealth = useCloudAiHealth();
    const { unreadAnnouncements } = useEventStream();
    const notifCount = unreadAnnouncements > 0 ? unreadAnnouncements : undefined;

    const currentKey = useMemo(
        () =>
            navItems
                .slice()
                .reverse()
                .find((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))?.key ??
            '/learning',
        [location.pathname],
    );

    const currentLabel = navItems.find((item) => item.key === currentKey)?.label ?? '学习';
    const isDarkTheme = resolvedTheme === 'dark';
    const cloudStatusDotClass =
        cloudHealth.status === 'ready'
            ? 'bg-emerald-500'
            : cloudHealth.status === 'checking'
              ? 'bg-amber-400'
              : 'bg-rose-500';

    if (isMobile) {
        return (
            <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/88 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/88">
                    <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                                size={36}
                                style={{ background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}
                            >
                                E
                            </Avatar>
                            <div className="min-w-0" data-tauri-drag-region>
                                <Text strong className="block text-slate-900 dark:text-slate-100">
                                    EduCloud
                                </Text>
                                <Text className="block text-xs text-slate-500 dark:text-slate-400">
                                    {currentLabel}
                                </Text>
                            </div>
                        </div>

                        <div className="ml-auto flex items-center gap-1">
                            <Badge count={notifCount} size="small">
                                <ShellIconButton>
                                    <BellOutlined style={{ fontSize: 18 }} />
                                </ShellIconButton>
                            </Badge>
                            <ShellIconButton onClick={() => navigate('/settings/ai')}>
                                <SettingOutlined style={{ fontSize: 18 }} />
                            </ShellIconButton>
                        </div>
                    </div>
                </header>

                <main className="min-h-screen bg-white pb-20 pt-16 dark:bg-slate-900">
                    <Suspense fallback={<ShellOutletFallback />}>
                        <Outlet />
                    </Suspense>
                </main>

                <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-slate-50/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
                    <div className="flex items-center justify-around">
                        {navItems.map((item) => {
                            const active = currentKey === item.key;
                            const isLocalAi = !!item.isLocalAi;
                            const baseColor = active
                                ? isLocalAi
                                    ? 'text-violet-700 dark:text-violet-200'
                                    : 'text-blue-700 dark:text-blue-200'
                                : isLocalAi
                                  ? 'text-violet-600 dark:text-violet-300'
                                  : 'text-slate-500 dark:text-slate-400';

                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => navigate(item.key)}
                                    className={clsx(
                                        'relative flex min-w-[60px] flex-col items-center justify-center rounded-2xl px-3 py-2 transition-colors',
                                        active &&
                                            (isLocalAi
                                                ? 'bg-violet-50 dark:bg-violet-500/10'
                                                : 'bg-blue-50 dark:bg-blue-500/10'),
                                        baseColor,
                                    )}
                                >
                                    <div className="relative">
                                        {item.badge && !active ? (
                                            <Badge count={item.badge} size="small">
                                                {item.icon}
                                            </Badge>
                                        ) : (
                                            item.icon
                                        )}
                                    </div>
                                    <span className="mt-1 text-[11px] font-medium">{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
            </div>
        );
    }

    return (
        <div className="h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex h-full">
                <aside
                    data-testid="app-shell-sidebar"
                    className="flex w-64 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"
                >
                    <div className="px-6 pb-5 pt-6" data-tauri-drag-region>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]">
                                E
                            </div>
                            <div>
                                <Text strong className="block text-[15px] text-slate-900 dark:text-slate-100">
                                    EduCloud
                                </Text>
                                <Text className="block text-xs text-slate-500 dark:text-slate-400">
                                    Apple / Linear minimal shell
                                </Text>
                            </div>
                        </div>
                    </div>

                    <nav className="flex-1 px-3">
                        <div className="space-y-1">
                            {navItems.map((item) => {
                                const active = currentKey === item.key;
                                const isLocalAi = !!item.isLocalAi;

                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => navigate(item.key)}
                                        className={clsx(
                                            'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors',
                                            active &&
                                                (isLocalAi
                                                    ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200'
                                                    : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200'),
                                            !active &&
                                                (isLocalAi
                                                    ? 'text-violet-700 hover:bg-violet-50/70 dark:text-violet-300 dark:hover:bg-violet-500/8'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'),
                                        )}
                                    >
                                        <span className="flex items-center justify-center text-base">{item.icon}</span>
                                        <span className="flex-1">{item.label}</span>
                                        {item.badge ? <Badge count={item.badge} size="small" /> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </nav>

                    <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                        <div className="space-y-3 rounded-3xl bg-white/75 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80 backdrop-blur dark:bg-slate-900/75 dark:ring-slate-800">
                            <div className="flex items-center gap-3 text-sm">
                                <span
                                    className={clsx('h-2.5 w-2.5 rounded-full', cloudStatusDotClass)}
                                />
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{cloudHealth.title}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{cloudHealth.detail}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-sm">
                                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-900 dark:text-slate-100">
                                        {localStatusText[localModelStatus]}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">桌面端本地推理设备状态</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                            <ShellIconButton onClick={() => navigate('/settings/ai')}>
                                <SettingOutlined style={{ fontSize: 18 }} />
                            </ShellIconButton>
                            <Badge count={3} size="small" offset={[-2, 2]}>
                                <ShellIconButton>
                                    <BellOutlined style={{ fontSize: 18 }} />
                                </ShellIconButton>
                            </Badge>
                        </div>
                    </div>
                </aside>

                <div
                    data-testid="app-shell-main"
                    className={clsx(
                        'min-w-0 flex-1 overflow-hidden',
                        isDarkTheme ? 'bg-slate-900' : 'bg-white',
                    )}
                >
                    <main className="h-full overflow-auto bg-white dark:bg-slate-900">
                        <Suspense fallback={<ShellOutletFallback />}>
                            <Outlet />
                        </Suspense>
                    </main>
                </div>
            </div>
        </div>
    );
}
