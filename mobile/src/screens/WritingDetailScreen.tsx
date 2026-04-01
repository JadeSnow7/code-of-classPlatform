import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { getWritingSubmission, parseWritingFeedback, WRITING_TYPE_LABELS } from '../api';
import type { AuthSession, WritingSubmission } from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'WritingDetail'> & {
    session: AuthSession;
};

export default function WritingDetailScreen({ route, session }: Props) {
    const { submissionId } = route.params;

    const [submission, setSubmission] = useState<WritingSubmission | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const feedback = useMemo(() => {
        if (!submission) {
            return null;
        }
        return parseWritingFeedback(submission);
    }, [submission]);

    const loadDetail = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError(null);

        try {
            const data = await getWritingSubmission(session.token, session.tokenType, submissionId);
            setSubmission(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : '加载写作详情失败';
            setError(message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.token, session.tokenType, submissionId]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    if (loading && !refreshing) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.centerText}>加载写作详情中...</Text>
            </View>
        );
    }

    if (error && !submission) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={() => void loadDetail()}>
                    <Text style={styles.retryButtonText}>重试</Text>
                </Pressable>
            </View>
        );
    }

    if (!submission) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.centerText}>未找到写作记录</Text>
            </View>
        );
    }

    const writingType = WRITING_TYPE_LABELS[submission.writing_type] ?? submission.writing_type;

    return (
        <ScrollView
            style={appStyles.page}
            contentContainerStyle={styles.pageContent}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void loadDetail(true)}
                    tintColor={palette.primary}
                />
            }
        >
            <View style={styles.headerCard}>
                <Text style={styles.title}>{submission.title}</Text>
                <View style={styles.metaRow}>
                    <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{writingType}</Text>
                    </View>
                    <Text style={styles.metaText}>{submission.word_count} 词</Text>
                    <Text style={styles.metaText}>
                        {new Date(submission.created_at).toLocaleString('zh-CN')}
                    </Text>
                </View>
            </View>

            <View style={styles.contentCard}>
                <Text style={styles.sectionTitle}>原文内容</Text>
                <Text style={styles.contentText}>{submission.content}</Text>
            </View>

            <View style={styles.contentCard}>
                <Text style={styles.sectionTitle}>AI 反馈</Text>
                {feedback ? (
                    <>
                        <View style={styles.scoreWrap}>
                            <Text style={styles.scoreValue}>{feedback.overall_score}</Text>
                            <Text style={styles.scoreSuffix}>/ 10</Text>
                        </View>

                        <View style={styles.blockColumn}>
                            {feedback.dimensions?.map((dimension) => {
                                const pct = Math.min(100, Math.max(0, (dimension.score / 10) * 100));
                                const barColor =
                                    pct >= 80
                                        ? palette.success
                                        : pct >= 60
                                          ? palette.primary
                                          : pct >= 40
                                            ? palette.warning
                                            : palette.danger;
                                return (
                                    <View key={dimension.name} style={styles.dimensionItem}>
                                        <View style={styles.dimensionHeader}>
                                            <Text style={styles.dimensionName}>{dimension.name}</Text>
                                            <Text style={[styles.dimensionScore, { color: barColor }]}>
                                                {dimension.score}
                                                <Text style={styles.dimensionScoreSuffix}>/10</Text>
                                            </Text>
                                        </View>
                                        <View style={styles.progressTrack}>
                                            <View
                                                style={[
                                                    styles.progressFill,
                                                    { width: `${pct}%` as `${number}%`, backgroundColor: barColor },
                                                ]}
                                            />
                                        </View>
                                        <Text style={styles.dimensionComment}>{dimension.comment}</Text>
                                    </View>
                                );
                            })}
                        </View>

                        <View style={styles.feedbackBlock}>
                            <Text style={styles.feedbackHeading}>优点</Text>
                            {feedback.strengths?.length ? (
                                feedback.strengths.map((item, idx) => (
                                    <Text key={`${item}-${idx}`} style={styles.feedbackItem}>• {item}</Text>
                                ))
                            ) : (
                                <Text style={styles.feedbackEmpty}>暂无优点描述</Text>
                            )}
                        </View>

                        <View style={styles.feedbackBlock}>
                            <Text style={styles.feedbackHeading}>改进建议</Text>
                            {feedback.improvements?.length ? (
                                feedback.improvements.map((item, idx) => (
                                    <Text key={`${item}-${idx}`} style={styles.feedbackItem}>• {item}</Text>
                                ))
                            ) : (
                                <Text style={styles.feedbackEmpty}>暂无改进建议</Text>
                            )}
                        </View>

                        {feedback.summary ? (
                            <View style={styles.summaryBox}>
                                <Text style={styles.summaryTitle}>总结</Text>
                                <Text style={styles.summaryText}>{feedback.summary}</Text>
                            </View>
                        ) : null}
                    </>
                ) : (
                    <Text style={styles.pendingText}>AI 分析仍在进行中，请稍后刷新查看。</Text>
                )}
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
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    centerText: {
        marginTop: spacing.sm,
        color: palette.textMuted,
        fontSize: 14,
    },
    errorText: {
        color: palette.danger,
        fontSize: 14,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: palette.primaryMuted,
    },
    retryButtonText: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    headerCard: {
        ...appStyles.card,
        backgroundColor: palette.backgroundElevated,
        gap: spacing.sm,
    },
    title: {
        color: palette.textPrimary,
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 30,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        alignItems: 'center',
    },
    typeBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        borderRadius: radius.full,
        backgroundColor: '#312e81',
    },
    typeBadgeText: {
        color: '#c7d2fe',
        fontSize: 11,
        fontWeight: '700',
    },
    metaText: {
        color: palette.textMuted,
        fontSize: 12,
    },
    contentCard: {
        ...appStyles.card,
        gap: spacing.md,
    },
    sectionTitle: {
        color: palette.textPrimary,
        fontSize: 16,
        fontWeight: '700',
    },
    contentText: {
        color: palette.textSecondary,
        fontSize: 14,
        lineHeight: 22,
    },
    scoreWrap: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.xs,
    },
    scoreValue: {
        color: palette.accentCyan,
        fontSize: 42,
        fontWeight: '800',
    },
    scoreSuffix: {
        color: palette.textMuted,
        fontSize: 16,
        marginBottom: 8,
    },
    blockColumn: {
        gap: spacing.sm,
    },
    dimensionItem: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        padding: spacing.sm,
        gap: spacing.xs,
    },
    dimensionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dimensionName: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    dimensionScore: {
        fontSize: 14,
        fontWeight: '700',
    },
    dimensionScoreSuffix: {
        fontSize: 11,
        fontWeight: '400',
        color: palette.textMuted,
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
    dimensionComment: {
        color: palette.textSecondary,
        fontSize: 13,
        lineHeight: 20,
    },
    feedbackBlock: {
        gap: spacing.xs,
    },
    feedbackHeading: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    feedbackItem: {
        color: palette.textSecondary,
        fontSize: 13,
        lineHeight: 20,
    },
    feedbackEmpty: {
        color: palette.textMuted,
        fontSize: 12,
    },
    summaryBox: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        padding: spacing.sm,
        gap: spacing.xs,
    },
    summaryTitle: {
        color: palette.accentCyan,
        fontSize: 13,
        fontWeight: '700',
    },
    summaryText: {
        color: palette.textSecondary,
        fontSize: 13,
        lineHeight: 20,
    },
    pendingText: {
        color: palette.warning,
        fontSize: 13,
    },
});
