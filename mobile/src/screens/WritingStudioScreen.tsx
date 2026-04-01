import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
    WRITING_TYPE_LABELS,
    getWritingSubmissions,
    parseWritingFeedback,
    submitWriting,
} from '../api';
import type { AuthSession, WritingSubmission, WritingType } from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'WritingStudio'> & {
    session: AuthSession;
};

const WRITING_TYPES: WritingType[] = ['course_paper', 'literature_review', 'thesis', 'abstract'];

const WRITING_TYPE_COLORS: Record<WritingType, { bg: string; text: string }> = {
    course_paper: { bg: '#1e3a8a', text: '#93c5fd' },
    literature_review: { bg: '#4c1d95', text: '#c4b5fd' },
    thesis: { bg: '#064e3b', text: '#6ee7b7' },
    abstract: { bg: '#78350f', text: '#fcd34d' },
};

function scoreColor(score: number): string {
    const pct = score * 10;
    if (pct >= 80) return palette.success;
    if (pct >= 60) return palette.primary;
    if (pct >= 40) return palette.warning;
    return palette.danger;
}

function ScoreBadge({ score }: { score: number }) {
    return (
        <View style={[styles.scoreBadge, { borderColor: scoreColor(score) }]}>
            <Text style={[styles.scoreBadgeText, { color: scoreColor(score) }]}>
                {score.toFixed(1)}
            </Text>
        </View>
    );
}

function SubmissionCard({
    item,
    onPress,
}: {
    item: WritingSubmission;
    onPress: () => void;
}) {
    const feedback = parseWritingFeedback(item);
    const typeColor = WRITING_TYPE_COLORS[item.writing_type] ?? { bg: '#1e293b', text: '#94a3b8' };

    return (
        <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={onPress}
        >
            <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                </Text>
                {feedback ? (
                    <ScoreBadge score={feedback.overall_score} />
                ) : (
                    <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>待分析</Text>
                    </View>
                )}
            </View>

            <View style={styles.cardMeta}>
                <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor.text }]}>
                        {WRITING_TYPE_LABELS[item.writing_type]}
                    </Text>
                </View>
                <Text style={styles.metaText}>{item.word_count} 词</Text>
                <Text style={styles.metaText}>
                    {new Date(item.created_at).toLocaleDateString('zh-CN')}
                </Text>
            </View>

            {feedback && feedback.dimensions.length > 0 && (
                <View style={styles.dimensionBars}>
                    {feedback.dimensions.slice(0, 3).map((d) => (
                        <View key={d.name} style={styles.miniBar}>
                            <Text style={styles.miniBarLabel} numberOfLines={1}>
                                {d.name}
                            </Text>
                            <View style={styles.miniBarTrack}>
                                <View
                                    style={[
                                        styles.miniBarFill,
                                        {
                                            width: `${Math.min(d.score * 10, 100)}%`,
                                            backgroundColor: scoreColor(d.score),
                                        },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.miniBarScore, { color: scoreColor(d.score) }]}>
                                {d.score.toFixed(1)}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </Pressable>
    );
}

function NewSubmissionModal({
    visible,
    courseId,
    session,
    onClose,
    onSuccess,
}: {
    visible: boolean;
    courseId: number;
    session: AuthSession;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [writingType, setWritingType] = useState<WritingType>('course_paper');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

    const handleSubmit = async () => {
        if (!title.trim()) { setError('请输入写作标题'); return; }
        if (wordCount < 50) { setError(`内容至少 50 词，当前 ${wordCount} 词`); return; }
        setError(null);
        setSubmitting(true);
        try {
            await submitWriting(session.token, session.tokenType, courseId, {
                title: title.trim(),
                content: content.trim(),
                writing_type: writingType,
            });
            setTitle('');
            setContent('');
            setWritingType('course_paper');
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : '提交失败，请重试');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.modalRoot}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>新建写作</Text>
                    <Pressable onPress={onClose} style={styles.modalClose}>
                        <Text style={styles.modalCloseText}>取消</Text>
                    </Pressable>
                </View>

                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                    <Text style={styles.fieldLabel}>写作类型</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.typeRow}
                    >
                        {WRITING_TYPES.map((t) => {
                            const colors = WRITING_TYPE_COLORS[t];
                            const active = writingType === t;
                            return (
                                <Pressable
                                    key={t}
                                    onPress={() => setWritingType(t)}
                                    style={[
                                        styles.typeChip,
                                        active && { backgroundColor: colors.bg, borderColor: colors.text },
                                    ]}
                                >
                                    <Text style={[styles.typeChipText, active && { color: colors.text }]}>
                                        {WRITING_TYPE_LABELS[t]}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    <Text style={styles.fieldLabel}>标题</Text>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="输入写作标题"
                        placeholderTextColor={palette.textMuted}
                        style={styles.titleInput}
                    />

                    <View style={styles.contentLabelRow}>
                        <Text style={styles.fieldLabel}>正文</Text>
                        <Text style={[styles.wordCount, wordCount >= 50 && styles.wordCountOk]}>
                            {wordCount} 词
                        </Text>
                    </View>
                    <TextInput
                        value={content}
                        onChangeText={setContent}
                        placeholder="输入或粘贴英文写作内容（至少 50 词）"
                        placeholderTextColor={palette.textMuted}
                        style={styles.contentInput}
                        multiline
                        numberOfLines={10}
                        textAlignVertical="top"
                    />

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </ScrollView>

                <View style={styles.modalFooter}>
                    <Pressable
                        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                        onPress={() => void handleSubmit()}
                        disabled={submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator size="small" color={palette.textPrimary} />
                        ) : (
                            <Text style={styles.submitBtnText}>提交分析</Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

export default function WritingStudioScreen({ route, navigation, session }: Props) {
    const { courseId } = route.params;

    const [submissions, setSubmissions] = useState<WritingSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showNewForm, setShowNewForm] = useState(false);

    const loadSubmissions = useCallback(
        async (isRefresh = false) => {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);
            setError(null);
            try {
                const data = await getWritingSubmissions(session.token, session.tokenType, courseId);
                setSubmissions(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : '加载失败');
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [session.token, session.tokenType, courseId],
    );

    useEffect(() => { void loadSubmissions(); }, [loadSubmissions]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.centerText}>加载中...</Text>
            </View>
        );
    }

    return (
        <View style={appStyles.page}>
            <FlatList
                data={submissions}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => void loadSubmissions(true)}
                        tintColor={palette.primary}
                    />
                }
                ListHeaderComponent={
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{submissions.length}</Text>
                            <Text style={styles.statLabel}>提交总数</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>
                                {submissions.filter((s) => parseWritingFeedback(s) !== null).length}
                            </Text>
                            <Text style={styles.statLabel}>已分析</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={[styles.statValue, { color: palette.accentCyan }]}>
                                {(() => {
                                    const scored = submissions
                                        .map((s) => parseWritingFeedback(s)?.overall_score)
                                        .filter((v): v is number => v !== undefined);
                                    return scored.length
                                        ? (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1)
                                        : '--';
                                })()}
                            </Text>
                            <Text style={styles.statLabel}>平均分</Text>
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    error ? (
                        <View style={styles.center}>
                            <Text style={styles.errorText}>{error}</Text>
                            <Pressable style={styles.retryBtn} onPress={() => void loadSubmissions()}>
                                <Text style={styles.retryBtnText}>重试</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyIcon}>✍️</Text>
                            <Text style={styles.emptyText}>还没有写作记录</Text>
                            <Text style={styles.emptyHint}>点击右下角按钮开始第一篇写作</Text>
                        </View>
                    )
                }
                renderItem={({ item }) => (
                    <SubmissionCard
                        item={item}
                        onPress={() =>
                            navigation.navigate('WritingDetail', {
                                submissionId: item.id,
                                courseId,
                                title: item.title,
                            })
                        }
                    />
                )}
            />

            {/* FAB */}
            <Pressable
                style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
                onPress={() => setShowNewForm(true)}
            >
                <Text style={styles.fabIcon}>+</Text>
            </Pressable>

            <NewSubmissionModal
                visible={showNewForm}
                courseId={courseId}
                session={session}
                onClose={() => setShowNewForm(false)}
                onSuccess={() => {
                    setShowNewForm(false);
                    void loadSubmissions(true);
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    listContent: {
        padding: spacing.md,
        paddingBottom: 96,
        gap: spacing.sm,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    centerText: { color: palette.textMuted, fontSize: 14, marginTop: spacing.sm },
    errorText: { color: palette.danger, fontSize: 13, textAlign: 'center' },

    // Stats row
    statsRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    statCard: {
        flex: 1,
        ...appStyles.card,
        alignItems: 'center',
        paddingVertical: spacing.md,
        gap: spacing.xxs,
    },
    statValue: { color: palette.textPrimary, fontSize: 22, fontWeight: '800' },
    statLabel: { color: palette.textMuted, fontSize: 11, fontWeight: '600' },

    // Submission card
    card: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    cardPressed: { opacity: 0.7 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
    cardTitle: { flex: 1, color: palette.textPrimary, fontSize: 15, fontWeight: '700', lineHeight: 22 },
    cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
    typeBadgeText: { fontSize: 11, fontWeight: '700' },
    metaText: { color: palette.textMuted, fontSize: 12 },
    scoreBadge: {
        borderWidth: 1.5,
        borderRadius: radius.full,
        paddingHorizontal: 8,
        paddingVertical: 2,
        minWidth: 44,
        alignItems: 'center',
    },
    scoreBadgeText: { fontSize: 13, fontWeight: '800' },
    pendingBadge: {
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: radius.full,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    pendingBadgeText: { color: palette.textMuted, fontSize: 11 },

    // Mini dimension bars
    dimensionBars: { gap: 6 },
    miniBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    miniBarLabel: { color: palette.textMuted, fontSize: 11, width: 56 },
    miniBarTrack: {
        flex: 1,
        height: 4,
        backgroundColor: palette.backgroundMuted,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    miniBarFill: { height: '100%', borderRadius: radius.full },
    miniBarScore: { fontSize: 11, fontWeight: '700', width: 28, textAlign: 'right' },

    // FAB
    fab: {
        position: 'absolute',
        bottom: 28,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    fabPressed: { opacity: 0.8 },
    fabIcon: { color: palette.textPrimary, fontSize: 28, lineHeight: 32, fontWeight: '300' },

    // Modal
    modalRoot: { flex: 1, backgroundColor: palette.background },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
    },
    modalTitle: { color: palette.textPrimary, fontSize: 17, fontWeight: '700' },
    modalClose: { padding: spacing.xs },
    modalCloseText: { color: palette.primary, fontSize: 15 },
    modalBody: { flex: 1, padding: spacing.md },
    modalFooter: { padding: spacing.md, borderTopWidth: 1, borderTopColor: palette.border },

    fieldLabel: {
        color: palette.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        marginBottom: spacing.xs,
        marginTop: spacing.sm,
    },
    typeRow: { gap: spacing.xs, paddingBottom: spacing.xs },
    typeChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.backgroundMuted,
    },
    typeChipText: { color: palette.textMuted, fontSize: 13, fontWeight: '600' },
    titleInput: {
        backgroundColor: palette.backgroundElevated,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        color: palette.textPrimary,
        fontSize: 15,
    },
    contentLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    wordCount: { color: palette.textMuted, fontSize: 12 },
    wordCountOk: { color: palette.success },
    contentInput: {
        backgroundColor: palette.backgroundElevated,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        color: palette.textPrimary,
        fontSize: 14,
        lineHeight: 22,
        minHeight: 180,
    },
    submitBtn: {
        backgroundColor: palette.primary,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: palette.textPrimary, fontSize: 15, fontWeight: '700' },
    retryBtn: {
        marginTop: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: palette.backgroundMuted,
    },
    retryBtnText: { color: palette.textPrimary, fontWeight: '700' },
    emptyBox: { alignItems: 'center', paddingVertical: spacing.xxl * 2 },
    emptyIcon: { fontSize: 48, marginBottom: spacing.md },
    emptyText: { color: palette.textSecondary, fontSize: 16, fontWeight: '700' },
    emptyHint: { color: palette.textMuted, fontSize: 13, marginTop: spacing.xs },
});
