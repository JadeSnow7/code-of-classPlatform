import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getChapterContent, getChapterStats, recordStudyTime } from '../api';
import type { AuthSession, Chapter, ChapterStats } from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'ChapterContent'> & {
    session: AuthSession;
};

const HEARTBEAT_INTERVAL_MS = 30000;

export default function ChapterContentScreen({ route, session }: Props) {
    const { chapterId } = route.params;
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [stats, setStats] = useState<ChapterStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [studySeconds, setStudySeconds] = useState(0);

    const lastHeartbeatRef = useRef(Date.now());
    const isActiveRef = useRef(true);

    useEffect(() => {
        const fetchContent = async () => {
            setLoading(true);
            setError(null);

            try {
                const [chapterData, statsData] = await Promise.all([
                    getChapterContent(session.token, session.tokenType, chapterId),
                    getChapterStats(session.token, session.tokenType, chapterId),
                ]);
                setChapter(chapterData);
                setStats(statsData);
                setStudySeconds(statsData.study_duration_seconds ?? 0);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load chapter');
            } finally {
                setLoading(false);
            }
        };

        void fetchContent();
    }, [chapterId, session.token, session.tokenType]);

    useEffect(() => {
        lastHeartbeatRef.current = Date.now();
        isActiveRef.current = true;

        const sendHeartbeat = async () => {
            const now = Date.now();
            const elapsed = Math.floor((now - lastHeartbeatRef.current) / 1000);

            if (!isActiveRef.current || elapsed <= 0) {
                return;
            }

            try {
                await recordStudyTime(session.token, session.tokenType, chapterId, elapsed);
                setStudySeconds((prev) => prev + elapsed);
                lastHeartbeatRef.current = now;
            } catch {
                // Ignore heartbeat errors.
            }
        };

        const handleAppStateChange = (nextState: string) => {
            if (nextState === 'active') {
                isActiveRef.current = true;
                lastHeartbeatRef.current = Date.now();
            } else {
                isActiveRef.current = false;
                void sendHeartbeat();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        const intervalId = setInterval(() => {
            void sendHeartbeat();
        }, HEARTBEAT_INTERVAL_MS);

        return () => {
            subscription.remove();
            clearInterval(intervalId);
            void sendHeartbeat();
        };
    }, [chapterId, session.token, session.tokenType]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.centerText}>加载章节内容中...</Text>
            </View>
        );
    }

    if (error || !chapter) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error || '章节不存在'}</Text>
            </View>
        );
    }

    const knowledgePoints = stats?.knowledge_points ?? [];
    const resources = stats?.resources ?? [];

    return (
        <ScrollView style={appStyles.page} contentContainerStyle={styles.pageContent}>
            <View style={styles.studyBar}>
                <Text style={styles.studyLabel}>本章累计学习</Text>
                <Text style={styles.studyValue}>{formatTime(studySeconds)}</Text>
            </View>

            <View style={styles.heroCard}>
                <Text style={styles.chapterTitle}>{chapter.title}</Text>
                {chapter.summary || chapter.description ? (
                    <Text style={styles.chapterSummary}>{chapter.summary || chapter.description}</Text>
                ) : null}
            </View>

            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>正文内容</Text>
                <Text style={styles.contentText}>{chapter.content || '暂无内容'}</Text>
            </View>

            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>知识点</Text>
                {knowledgePoints.length === 0 ? (
                    <Text style={styles.emptyText}>暂无知识点标注</Text>
                ) : (
                    <View style={styles.pointWrap}>
                        {knowledgePoints.map((point, index) => (
                            <View key={`${point}-${index}`} style={styles.pointChip}>
                                <Text style={styles.pointText}>{point}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>学习资料</Text>
                {resources.length === 0 ? (
                    <Text style={styles.emptyText}>暂无关联资料</Text>
                ) : (
                    <View style={styles.resourceColumn}>
                        {resources.map((resource) => (
                            <Pressable key={resource.ID} style={styles.resourceItem}>
                                <View style={styles.resourceMain}>
                                    <Text style={styles.resourceTitle}>{resource.title || resource.name || '未命名资源'}</Text>
                                    <Text style={styles.resourceMeta}>{resource.type || 'link'}</Text>
                                </View>
                                <Text style={styles.chevron}>›</Text>
                            </Pressable>
                        ))}
                    </View>
                )}
            </View>

            <View style={styles.gridRow}>
                <View style={styles.gridCard}>
                    <Text style={styles.gridLabel}>作业提交</Text>
                    <Text style={styles.gridValue}>
                        {stats?.assignment_stats?.submitted ?? 0}/{stats?.assignment_stats?.total ?? 0}
                    </Text>
                    <Text style={styles.gridSub}>平均分 {(stats?.assignment_stats?.avg_score ?? 0).toFixed(1)}</Text>
                </View>
                <View style={styles.gridCard}>
                    <Text style={styles.gridLabel}>测验完成</Text>
                    <Text style={styles.gridValue}>
                        {stats?.quiz_stats?.attempted ?? 0}/{stats?.quiz_stats?.total ?? 0}
                    </Text>
                    <Text style={styles.gridSub}>平均分 {(stats?.quiz_stats?.avg_score ?? 0).toFixed(1)}</Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    pageContent: {
        padding: spacing.md,
        paddingBottom: spacing.xxl,
        gap: spacing.md,
    },
    centerContainer: {
        ...appStyles.page,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    centerText: {
        color: palette.textMuted,
        marginTop: spacing.sm,
        fontSize: 14,
    },
    errorText: {
        color: palette.danger,
        fontSize: 14,
        textAlign: 'center',
    },
    studyBar: {
        ...appStyles.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#073b2a',
        borderColor: '#14532d',
    },
    studyLabel: {
        color: '#a7f3d0',
        fontSize: 13,
        fontWeight: '600',
    },
    studyValue: {
        color: '#34d399',
        fontSize: 20,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    heroCard: {
        ...appStyles.card,
        backgroundColor: palette.backgroundElevated,
    },
    chapterTitle: {
        color: palette.textPrimary,
        fontSize: 24,
        fontWeight: '700',
        marginBottom: spacing.xs,
    },
    chapterSummary: {
        color: palette.textSecondary,
        fontSize: 14,
        lineHeight: 22,
    },
    sectionCard: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    sectionTitle: {
        color: palette.textPrimary,
        fontSize: 16,
        fontWeight: '700',
    },
    contentText: {
        color: palette.textSecondary,
        fontSize: 15,
        lineHeight: 25,
    },
    emptyText: {
        color: palette.textMuted,
        fontSize: 13,
    },
    pointWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
    },
    pointChip: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 7,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: '#4338ca',
        backgroundColor: '#312e81',
    },
    pointText: {
        color: '#c7d2fe',
        fontSize: 12,
        fontWeight: '600',
    },
    resourceColumn: {
        gap: spacing.xs,
    },
    resourceItem: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    resourceMain: {
        flex: 1,
        gap: 4,
    },
    resourceTitle: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    resourceMeta: {
        color: palette.textMuted,
        fontSize: 11,
        textTransform: 'uppercase',
    },
    chevron: {
        color: palette.textMuted,
        fontSize: 20,
    },
    gridRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    gridCard: {
        ...appStyles.card,
        width: '48%',
        backgroundColor: '#0f1a2f',
    },
    gridLabel: {
        color: palette.textMuted,
        fontSize: 12,
    },
    gridValue: {
        color: palette.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        marginTop: spacing.xs,
    },
    gridSub: {
        color: palette.textSecondary,
        fontSize: 11,
        marginTop: 4,
    },
});
