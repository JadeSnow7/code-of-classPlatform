import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getLearningProfile } from '../api';
import type { AuthSession, LearningProfile } from '../types';
import type { KnowledgeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<KnowledgeStackParamList, 'KnowledgeCourse'> & {
    session: AuthSession;
};

function parseJsonArray(raw: string | undefined): string[] {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function parseWeakPoints(raw: string | undefined): Array<{ concept: string; count: number }> {
    if (!raw) return [];
    try {
        const map = JSON.parse(raw) as Record<string, number>;
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .map(([concept, count]) => ({ concept, count }));
    } catch { return []; }
}

/** mastery 0–1: count=0 → 1.0, count≥5 → 0.0 */
function masteryFromCount(count: number): number {
    return Math.max(0, 1 - count / 5);
}

function masteryColor(mastery: number): string {
    if (mastery >= 0.8) return palette.success;
    if (mastery >= 0.6) return palette.primary;
    if (mastery >= 0.4) return palette.warning;
    return palette.danger;
}

export default function KnowledgeCourseScreen({ route, session }: Props) {
    const { courseId, courseTitle } = route.params;
    const studentId = Number(session.user.id);

    const [profile, setProfile] = useState<LearningProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const data = await getLearningProfile(session.token, session.tokenType, courseId, studentId);
            setProfile(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载学习档案失败');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.token, session.tokenType, courseId, studentId]);

    useEffect(() => { void load(); }, [load]);

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.centerText}>加载学习档案...</Text>
            </View>
        );
    }

    if (error && !profile) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={() => void load()}>
                    <Text style={styles.retryButtonText}>重试</Text>
                </Pressable>
            </View>
        );
    }

    if (!profile) {
        return (
            <View style={styles.center}>
                <Text style={styles.centerText}>暂无学习档案</Text>
                <Text style={styles.centerSubText}>完成一次 AI 对话或写作分析后档案将自动创建。</Text>
            </View>
        );
    }

    const weakPoints = parseWeakPoints(profile.weak_points);
    const completedTopics = parseJsonArray(profile.completed_topics);
    const recommendedTopics = parseJsonArray(profile.recommended_topics);
    const lastActive = profile.last_session_at
        ? new Date(profile.last_session_at).toLocaleDateString('zh-CN')
        : '—';

    return (
        <ScrollView
            style={appStyles.page}
            contentContainerStyle={styles.pageContent}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.primary} />
            }
        >
            {/* ── Stats row ── */}
            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{profile.total_sessions}</Text>
                    <Text style={styles.statLabel}>对话次数</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{profile.total_study_minutes}</Text>
                    <Text style={styles.statLabel}>学习分钟</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{lastActive}</Text>
                    <Text style={styles.statLabel}>最近活跃</Text>
                </View>
            </View>

            {/* ── Weak-point mastery ── */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>薄弱知识点</Text>
                {weakPoints.length === 0 ? (
                    <Text style={styles.emptyHint}>暂未检测到薄弱点，继续学习后将自动更新。</Text>
                ) : (
                    weakPoints.map(({ concept, count }) => {
                        const mastery = masteryFromCount(count);
                        const color = masteryColor(mastery);
                        const pct = Math.round(mastery * 100);
                        return (
                            <View key={concept} style={styles.masteryRow}>
                                <View style={styles.masteryLabelRow}>
                                    <Text style={styles.conceptName}>{concept}</Text>
                                    <Text style={[styles.masteryPct, { color }]}>{pct}%</Text>
                                </View>
                                <View style={styles.progressTrack}>
                                    <View
                                        style={[
                                            styles.progressFill,
                                            { width: `${pct}%` as `${number}%`, backgroundColor: color },
                                        ]}
                                    />
                                </View>
                                <Text style={styles.countHint}>检测 {count} 次</Text>
                            </View>
                        );
                    })
                )}
            </View>

            {/* ── Completed topics ── */}
            {completedTopics.length > 0 ? (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>已掌握主题</Text>
                    <View style={styles.chipWrap}>
                        {completedTopics.map((topic) => (
                            <View key={topic} style={styles.chipSuccess}>
                                <Text style={styles.chipSuccessText}>{topic}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            ) : null}

            {/* ── Recommended topics ── */}
            {recommendedTopics.length > 0 ? (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>AI 推荐学习</Text>
                    <View style={styles.chipWrap}>
                        {recommendedTopics.map((topic) => (
                            <View key={topic} style={styles.chipRecommend}>
                                <Text style={styles.chipRecommendText}>{topic}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    center: {
        ...appStyles.page,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
        gap: spacing.sm,
    },
    centerText: {
        color: palette.textMuted,
        fontSize: 14,
    },
    centerSubText: {
        color: palette.textMuted,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    errorText: {
        color: palette.danger,
        fontSize: 14,
        textAlign: 'center',
    },
    retryButton: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: palette.primaryMuted,
    },
    retryButtonText: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    pageContent: {
        padding: spacing.md,
        paddingBottom: spacing.xxl,
        gap: spacing.md,
    },
    statsRow: {
        ...appStyles.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
        gap: 4,
    },
    statValue: {
        color: palette.accentCyan,
        fontSize: 22,
        fontWeight: '800',
    },
    statLabel: {
        color: palette.textMuted,
        fontSize: 11,
    },
    statDivider: {
        width: 1,
        height: 32,
        backgroundColor: palette.border,
    },
    card: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    cardTitle: {
        color: palette.textPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    emptyHint: {
        color: palette.textMuted,
        fontSize: 12,
        lineHeight: 18,
    },
    masteryRow: {
        gap: 4,
    },
    masteryLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    conceptName: {
        color: palette.textPrimary,
        fontSize: 13,
        fontWeight: '600',
    },
    masteryPct: {
        fontSize: 13,
        fontWeight: '700',
    },
    progressTrack: {
        height: 4,
        borderRadius: 2,
        backgroundColor: palette.border,
        overflow: 'hidden',
    },
    progressFill: {
        height: 4,
        borderRadius: 2,
    },
    countHint: {
        color: palette.textMuted,
        fontSize: 11,
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
    },
    chipSuccess: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radius.full,
        backgroundColor: '#052e16',
        borderWidth: 1,
        borderColor: '#14532d',
    },
    chipSuccessText: {
        color: '#86efac',
        fontSize: 12,
        fontWeight: '600',
    },
    chipRecommend: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radius.full,
        backgroundColor: '#1e3a5f',
        borderWidth: 1,
        borderColor: '#1e40af',
    },
    chipRecommendText: {
        color: '#93c5fd',
        fontSize: 12,
        fontWeight: '600',
    },
});
