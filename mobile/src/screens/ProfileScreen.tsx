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
                // Stats not available, ignore
            } finally {
                setLoadingStats(false);
            }
        };
        fetchStats();
    }, []);

    const handleClearMessages = () => {
        Alert.alert('清除聊天记录', '确定要清除所有本地消息吗？此操作不可撤销。', [
            { text: '取消', style: 'cancel' },
            { text: '清除', style: 'destructive', onPress: onClearMessages },
        ]);
    };

    const handleSignOut = () => {
        Alert.alert('退出登录', '确定要退出当前账号吗？', [
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
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* User Info Card */}
            <View style={styles.card}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {(session.user.username || 'U').charAt(0).toUpperCase()}
                    </Text>
                </View>
                <View style={styles.userInfo}>
                    <Text style={styles.username}>{session.user.username || '用户'}</Text>
                    <View style={styles.roleBadge}>
                        <Text style={styles.roleText}>
                            {session.user.role === 'teacher' ? '教师' : session.user.role === 'admin' ? '管理员' : '学生'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Stats Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>学习统计</Text>
                {loadingStats ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#60a5fa" />
                    </View>
                ) : stats ? (
                    <View style={styles.statsGrid}>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{formatStudyTime(stats.total_study_time_seconds)}</Text>
                            <Text style={styles.statLabel}>学习时长</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>
                                {stats.completed_chapters}/{stats.total_chapters}
                            </Text>
                            <Text style={styles.statLabel}>章节完成</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>
                                {stats.submitted_assignments}/{stats.total_assignments}
                            </Text>
                            <Text style={styles.statLabel}>作业提交</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>
                                {stats.completed_quizzes}/{stats.total_quizzes}
                            </Text>
                            <Text style={styles.statLabel}>测验完成</Text>
                        </View>
                    </View>
                ) : (
                    <Text style={styles.noDataText}>暂无学习数据</Text>
                )}
            </View>

            {/* Cache Section */}
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

            {/* Account Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>账户</Text>
                <Pressable
                    style={({ pressed }) => [styles.actionButton, styles.outlineButton, pressed && styles.buttonPressed]}
                    onPress={handleSignOut}
                >
                    <Text style={styles.outlineButtonText}>退出登录</Text>
                </Pressable>
            </View>

            {/* Version Info */}
            <View style={styles.footer}>
                <Text style={styles.versionText}>classPlatform Mobile v1.0.0</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0b1220',
    },
    content: {
        padding: 16,
        paddingBottom: 40,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#334155',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#2563eb',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    avatarText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
    },
    userInfo: {
        flex: 1,
    },
    username: {
        color: '#f8fafc',
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 6,
    },
    roleBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#374151',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    roleText: {
        color: '#9ca3af',
        fontSize: 12,
        fontWeight: '500',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
        marginLeft: 4,
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    statCard: {
        width: '48%',
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    statValue: {
        color: '#60a5fa',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 4,
    },
    statLabel: {
        color: '#94a3b8',
        fontSize: 12,
    },
    noDataText: {
        color: '#64748b',
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 20,
    },
    cacheRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#334155',
    },
    cacheLabel: {
        color: '#cbd5e1',
        fontSize: 14,
    },
    cacheValue: {
        color: '#94a3b8',
        fontSize: 14,
    },
    actionButton: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    dangerButton: {
        backgroundColor: '#450a0a',
        borderWidth: 1,
        borderColor: '#7f1d1d',
    },
    dangerButtonText: {
        color: '#fca5a5',
        fontSize: 15,
        fontWeight: '600',
    },
    outlineButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#475569',
    },
    outlineButtonText: {
        color: '#94a3b8',
        fontSize: 15,
        fontWeight: '600',
    },
    buttonPressed: {
        opacity: 0.7,
    },
    footer: {
        marginTop: 20,
        alignItems: 'center',
    },
    versionText: {
        color: '#475569',
        fontSize: 12,
    },
});
