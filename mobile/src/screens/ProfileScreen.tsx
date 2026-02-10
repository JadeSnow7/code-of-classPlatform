import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { getUserStats } from '../api';
import type { AuthSession, UserStats } from '../types';
import { appStyles, palette, radius, spacing } from '../theme';

type ProfileScreenProps = {
    session: AuthSession;
    messagesCount: number;
    onClearMessages: () => void;
    onSignOut: () => void;
};

export default function ProfileScreen({
    session,
    messagesCount,
    onClearMessages,
    onSignOut,
}: ProfileScreenProps) {
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getUserStats(session.token, session.tokenType);
                setStats(data);
            } catch {
                // Ignore stats failures.
            } finally {
                setLoadingStats(false);
            }
        };
        void fetchStats();
    }, [session.token, session.tokenType]);

    const handleClearMessages = () => {
        Alert.alert('清除聊天记录', '确定清除所有本地聊天消息吗？', [
            { text: '取消', style: 'cancel' },
            { text: '清除', style: 'destructive', onPress: onClearMessages },
        ]);
    };

    const handleSignOut = () => {
        Alert.alert('退出登录', '确定退出当前账号吗？', [
            { text: '取消', style: 'cancel' },
            { text: '退出', style: 'destructive', onPress: onSignOut },
        ]);
    };

    const formatStudyTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}秒`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
    };

    return (
        <ScrollView style={appStyles.page} contentContainerStyle={styles.content}>
            <View style={styles.profileCard}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(session.user.username || 'U').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.userInfo}>
                    <Text style={styles.username}>{session.user.username || '用户'}</Text>
                    <View style={styles.roleBadge}>
                        <Text style={styles.roleText}>
                            {session.user.role === 'teacher'
                                ? '教师'
                                : session.user.role === 'admin'
                                    ? '管理员'
                                    : session.user.role === 'assistant'
                                        ? '助教'
                                        : '学生'}
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>学习统计</Text>
                {loadingStats ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={palette.primary} />
                    </View>
                ) : stats ? (
                    <View style={styles.statsGrid}>
                        <StatCard label="学习时长" value={formatStudyTime(stats.total_study_time_seconds)} />
                        <StatCard label="章节完成" value={`${stats.completed_chapters}/${stats.total_chapters}`} />
                        <StatCard label="作业提交" value={`${stats.submitted_assignments}/${stats.total_assignments}`} />
                        <StatCard label="测验完成" value={`${stats.completed_quizzes}/${stats.total_quizzes}`} />
                    </View>
                ) : (
                    <Text style={styles.noDataText}>暂无学习数据</Text>
                )}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>本地缓存</Text>
                <View style={styles.cacheRow}>
                    <Text style={styles.cacheLabel}>聊天消息</Text>
                    <Text style={styles.cacheValue}>{messagesCount} 条</Text>
                </View>
                <Pressable
                    style={({ pressed }) => [styles.actionButton, styles.dangerButton, pressed && styles.buttonPressed]}
                    onPress={handleClearMessages}
                >
                    <Text style={styles.dangerButtonText}>清除聊天记录</Text>
                </Pressable>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>账户</Text>
                <Pressable
                    style={({ pressed }) => [styles.actionButton, styles.outlineButton, pressed && styles.buttonPressed]}
                    onPress={handleSignOut}
                >
                    <Text style={styles.outlineButtonText}>退出登录</Text>
                </Pressable>
            </View>

            <View style={styles.footer}>
                <Text style={styles.versionText}>classPlatform Mobile v2.0</Text>
            </View>
        </ScrollView>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.statCard}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: spacing.md,
        paddingBottom: spacing.xxl,
        gap: spacing.sm,
    },
    profileCard: {
        ...appStyles.card,
        backgroundColor: palette.backgroundElevated,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: palette.textPrimary,
        fontSize: 26,
        fontWeight: '800',
    },
    userInfo: {
        flex: 1,
    },
    username: {
        color: palette.textPrimary,
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 6,
    },
    roleBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#1f3b72',
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radius.full,
    },
    roleText: {
        color: '#dbeafe',
        fontSize: 11,
        fontWeight: '700',
    },
    section: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    sectionTitle: {
        color: palette.textSecondary,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    loadingContainer: {
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
    },
    statCard: {
        width: '48%',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        padding: spacing.sm,
        minHeight: 88,
        justifyContent: 'space-between',
    },
    statValue: {
        color: palette.accentCyan,
        fontSize: 19,
        fontWeight: '800',
    },
    statLabel: {
        color: palette.textMuted,
        fontSize: 11,
    },
    noDataText: {
        color: palette.textMuted,
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: spacing.md,
    },
    cacheRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        padding: spacing.sm,
    },
    cacheLabel: {
        color: palette.textSecondary,
        fontSize: 14,
    },
    cacheValue: {
        color: palette.textMuted,
        fontSize: 13,
    },
    actionButton: {
        minHeight: 42,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dangerButton: {
        borderWidth: 1,
        borderColor: '#7f1d1d',
        backgroundColor: '#450a0a',
    },
    dangerButtonText: {
        color: '#fca5a5',
        fontSize: 14,
        fontWeight: '700',
    },
    outlineButton: {
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
    },
    outlineButtonText: {
        color: palette.textSecondary,
        fontSize: 14,
        fontWeight: '700',
    },
    buttonPressed: {
        opacity: 0.8,
    },
    footer: {
        marginTop: spacing.sm,
        alignItems: 'center',
    },
    versionText: {
        color: palette.textMuted,
        fontSize: 11,
    },
});
