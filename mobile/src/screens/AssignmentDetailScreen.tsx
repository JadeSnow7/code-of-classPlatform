import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
    getAssignmentDetail,
    getAssignmentSubmissions,
    gradeAssignmentSubmission,
    submitAssignment,
} from '../api';
import type { Assignment, AssignmentSubmission, AuthSession } from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'AssignmentDetail'> & {
    session: AuthSession;
};

export default function AssignmentDetailScreen({ route, session }: Props) {
    const { assignmentId } = route.params;
    const isTeacher = session.user.role === 'teacher' || session.user.role === 'admin' || session.user.role === 'assistant';

    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const mySubmission = useMemo(() => {
        if (!assignment?.submission) {
            return null;
        }
        return assignment.submission as AssignmentSubmission;
    }, [assignment]);

    const loadData = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError(null);

        try {
            const assignmentData = await getAssignmentDetail(session.token, session.tokenType, assignmentId);
            setAssignment(assignmentData);

            if (isTeacher) {
                const allSubmissions = await getAssignmentSubmissions(session.token, session.tokenType, assignmentId);
                setSubmissions(allSubmissions);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : '加载作业详情失败';
            setError(message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [assignmentId, isTeacher, session.token, session.tokenType]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleSubmit = async () => {
        if (!content.trim() || submitting) {
            return;
        }

        setSubmitting(true);
        try {
            await submitAssignment(session.token, session.tokenType, assignmentId, {
                content: content.trim(),
            });
            setContent('');
            Alert.alert('提交成功', '作业已成功提交。');
            await loadData(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : '提交失败';
            Alert.alert('提交失败', message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.centerText}>加载作业详情中...</Text>
            </View>
        );
    }

    if (error && !assignment) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={() => void loadData()}>
                    <Text style={styles.retryButtonText}>重试</Text>
                </Pressable>
            </View>
        );
    }

    if (!assignment) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.centerText}>未找到作业</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={appStyles.page}
            contentContainerStyle={styles.pageContent}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void loadData(true)}
                    tintColor={palette.primary}
                />
            }
        >
            <View style={styles.heroCard}>
                <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                <Text style={styles.assignmentDescription}>{assignment.description || '暂无作业描述'}</Text>
                <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>截止时间</Text>
                    <Text style={styles.metaValue}>
                        {assignment.deadline
                            ? new Date(assignment.deadline).toLocaleString('zh-CN')
                            : '未设置'}
                    </Text>
                </View>
            </View>

            {isTeacher ? (
                <TeacherSubmissions
                    submissions={submissions}
                    onGrade={async (submissionId, grade, feedback) => {
                        await gradeAssignmentSubmission(session.token, session.tokenType, submissionId, {
                            grade,
                            feedback,
                        });
                    }}
                    onRefresh={async () => loadData(true)}
                />
            ) : (
                <View style={styles.studentSection}>
                    <Text style={appStyles.sectionTitle}>我的提交</Text>
                    {mySubmission ? (
                        <View style={styles.submissionCard}>
                            <Text style={styles.submissionText}>{mySubmission.content || '（无文本内容）'}</Text>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>提交时间</Text>
                                <Text style={styles.metaValue}>
                                    {mySubmission.submitted_at
                                        ? new Date(mySubmission.submitted_at).toLocaleString('zh-CN')
                                        : '未知'}
                                </Text>
                            </View>
                            {mySubmission.grade !== undefined && mySubmission.grade !== null ? (
                                <View style={styles.gradeBox}>
                                    <Text style={styles.gradeLabel}>评分</Text>
                                    <Text style={styles.gradeValue}>{mySubmission.grade}</Text>
                                    {mySubmission.feedback ? (
                                        <Text style={styles.gradeFeedback}>{mySubmission.feedback}</Text>
                                    ) : null}
                                </View>
                            ) : (
                                <Text style={styles.pendingText}>等待教师批改</Text>
                            )}
                        </View>
                    ) : (
                        <View style={styles.submitCard}>
                            <TextInput
                                style={styles.submitInput}
                                value={content}
                                onChangeText={setContent}
                                placeholder="输入作业内容..."
                                placeholderTextColor={palette.textMuted}
                                multiline
                                numberOfLines={6}
                                textAlignVertical="top"
                            />
                            <Pressable
                                style={({ pressed }) => [
                                    styles.submitButton,
                                    (!content.trim() || submitting) && styles.submitButtonDisabled,
                                    pressed && content.trim() && !submitting && styles.submitButtonPressed,
                                ]}
                                onPress={() => void handleSubmit()}
                                disabled={!content.trim() || submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color={palette.textPrimary} size="small" />
                                ) : (
                                    <Text style={styles.submitButtonText}>提交作业</Text>
                                )}
                            </Pressable>
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    );
}

function TeacherSubmissions({
    submissions,
    onGrade,
    onRefresh,
}: {
    submissions: AssignmentSubmission[];
    onGrade: (submissionId: number, grade: number, feedback?: string) => Promise<void>;
    onRefresh: () => Promise<void>;
}) {
    if (submissions.length === 0) {
        return (
            <View style={styles.studentSection}>
                <Text style={appStyles.sectionTitle}>学生提交</Text>
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>暂无学生提交</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.studentSection}>
            <Text style={appStyles.sectionTitle}>学生提交（{submissions.length}）</Text>
            <View style={styles.listColumn}>
                {submissions.map((submission) => (
                    <SubmissionGradeCard
                        key={submission.ID}
                        submission={submission}
                        onGrade={onGrade}
                        onRefresh={onRefresh}
                    />
                ))}
            </View>
        </View>
    );
}

function SubmissionGradeCard({
    submission,
    onGrade,
    onRefresh,
}: {
    submission: AssignmentSubmission;
    onGrade: (submissionId: number, grade: number, feedback?: string) => Promise<void>;
    onRefresh: () => Promise<void>;
}) {
    const [grade, setGrade] = useState(submission.grade !== undefined && submission.grade !== null ? String(submission.grade) : '');
    const [feedback, setFeedback] = useState(submission.feedback || '');
    const [grading, setGrading] = useState(false);

    const handleGrade = async () => {
        const parsedGrade = Number(grade);
        if (!Number.isFinite(parsedGrade) || parsedGrade < 0 || parsedGrade > 100) {
            Alert.alert('评分无效', '请输入 0-100 之间的分数。');
            return;
        }

        try {
            setGrading(true);
            await onGrade(submission.ID, parsedGrade, feedback.trim() || undefined);
            await onRefresh();
            Alert.alert('评分成功', '已更新该学生作业评分。');
        } catch (err) {
            const message = err instanceof Error ? err.message : '评分失败';
            Alert.alert('评分失败', message);
        } finally {
            setGrading(false);
        }
    };

    return (
        <View style={styles.submissionItemCard}>
            <View style={styles.submissionHeader}>
                <Text style={styles.submissionStudent}>学生 #{submission.student_id}</Text>
                <Text style={styles.submissionTime}>
                    {submission.submitted_at
                        ? new Date(submission.submitted_at).toLocaleString('zh-CN')
                        : '未知提交时间'}
                </Text>
            </View>
            <Text style={styles.submissionBody}>{submission.content || '（无文本内容）'}</Text>

            <View style={styles.gradeInputRow}>
                <TextInput
                    value={grade}
                    onChangeText={setGrade}
                    placeholder="分数"
                    placeholderTextColor={palette.textMuted}
                    keyboardType="number-pad"
                    style={styles.gradeInput}
                />
                <Pressable
                    style={({ pressed }) => [
                        styles.gradeButton,
                        grading && styles.submitButtonDisabled,
                        pressed && !grading && styles.submitButtonPressed,
                    ]}
                    disabled={grading}
                    onPress={() => void handleGrade()}
                >
                    {grading ? (
                        <ActivityIndicator color={palette.textPrimary} size="small" />
                    ) : (
                        <Text style={styles.gradeButtonText}>提交评分</Text>
                    )}
                </Pressable>
            </View>

            <TextInput
                value={feedback}
                onChangeText={setFeedback}
                placeholder="反馈（可选）"
                placeholderTextColor={palette.textMuted}
                style={styles.feedbackInput}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
            />
        </View>
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
        backgroundColor: palette.primaryMuted,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
    },
    retryButtonText: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    heroCard: {
        ...appStyles.card,
        backgroundColor: palette.backgroundElevated,
    },
    assignmentTitle: {
        color: palette.textPrimary,
        fontSize: 22,
        fontWeight: '700',
        marginBottom: spacing.xs,
    },
    assignmentDescription: {
        color: palette.textSecondary,
        fontSize: 14,
        lineHeight: 21,
        marginBottom: spacing.md,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    metaLabel: {
        color: palette.textMuted,
        fontSize: 12,
    },
    metaValue: {
        color: palette.textSecondary,
        fontSize: 12,
    },
    studentSection: {
        gap: spacing.sm,
    },
    submissionCard: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    submissionText: {
        color: palette.textPrimary,
        fontSize: 14,
        lineHeight: 22,
    },
    gradeBox: {
        marginTop: spacing.xs,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        paddingTop: spacing.sm,
        gap: spacing.xs,
    },
    gradeLabel: {
        color: palette.accentCyan,
        fontSize: 12,
        fontWeight: '700',
    },
    gradeValue: {
        color: palette.textPrimary,
        fontSize: 22,
        fontWeight: '700',
    },
    gradeFeedback: {
        color: palette.textSecondary,
        fontSize: 13,
        lineHeight: 19,
    },
    pendingText: {
        color: palette.warning,
        fontSize: 12,
    },
    submitCard: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    submitInput: {
        minHeight: 130,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: 14,
        lineHeight: 20,
    },
    submitButton: {
        backgroundColor: palette.primary,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 46,
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
    submitButtonPressed: {
        opacity: 0.85,
    },
    submitButtonText: {
        color: palette.textPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    emptyCard: {
        ...appStyles.card,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
    },
    emptyText: {
        color: palette.textMuted,
        fontSize: 14,
    },
    listColumn: {
        gap: spacing.sm,
    },
    submissionItemCard: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    submissionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.sm,
    },
    submissionStudent: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    submissionTime: {
        color: palette.textMuted,
        fontSize: 11,
    },
    submissionBody: {
        color: palette.textSecondary,
        fontSize: 13,
        lineHeight: 20,
    },
    gradeInputRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'center',
    },
    gradeInput: {
        width: 90,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        fontSize: 14,
    },
    gradeButton: {
        flex: 1,
        borderRadius: radius.md,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.primary,
    },
    gradeButtonText: {
        color: palette.textPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    feedbackInput: {
        minHeight: 82,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        fontSize: 13,
        lineHeight: 19,
    },
});
