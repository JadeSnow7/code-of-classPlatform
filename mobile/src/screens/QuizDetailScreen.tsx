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
    getQuizDetail,
    publishQuiz,
    startQuiz,
    submitQuiz,
    unpublishQuiz,
} from '../api';
import type {
    AuthSession,
    Question,
    QuestionWithAnswer,
    Quiz,
    QuizAttempt,
} from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'QuizDetail'> & {
    session: AuthSession;
};

type AnswerValue = string | string[];
type AnswersMap = Record<string, AnswerValue>;

function parseQuestionOptions(question: Question | QuestionWithAnswer): string[] {
    if (!question.options) {
        return [];
    }
    if (Array.isArray(question.options)) {
        return question.options;
    }
    try {
        const parsed = JSON.parse(question.options);
        if (Array.isArray(parsed)) {
            return parsed.map(String);
        }
    } catch {
        // fallback below
    }
    return String(question.options)
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

function formatRemain(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function normalizeQuestionType(question: Question | QuestionWithAnswer): string {
    if (question.type === 'true_false') {
        return 'single_choice';
    }
    return question.type;
}

export default function QuizDetailScreen({ route, session }: Props) {
    const { quizId } = route.params;
    const isTeacher = session.user.role === 'teacher' || session.user.role === 'admin' || session.user.role === 'assistant';

    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<Array<Question | QuestionWithAnswer>>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
    const [answers, setAnswers] = useState<AnswersMap>({});
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [result, setResult] = useState<{ score: number; max_score: number } | null>(null);

    const loadQuiz = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const data = await getQuizDetail(session.token, session.tokenType, quizId);
            setQuiz(data.quiz);
            setQuestions(data.questions);
        } catch (err) {
            const message = err instanceof Error ? err.message : '加载测验失败';
            setError(message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [quizId, session.token, session.tokenType]);

    useEffect(() => {
        void loadQuiz();
    }, [loadQuiz]);

    useEffect(() => {
        if (!attempt || attempt.submitted_at) {
            return;
        }

        const interval = setInterval(() => {
            const deadline = new Date(attempt.deadline).getTime();
            const remain = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
            setTimeLeft(remain);
            if (remain === 0) {
                void handleSubmit();
            }
        }, 1000);

        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);

    const scoreRate = useMemo(() => {
        if (!result || result.max_score <= 0) {
            return 0;
        }
        return Math.round((result.score / result.max_score) * 100);
    }, [result]);

    const handleStart = async () => {
        try {
            const data = await startQuiz(session.token, session.tokenType, quizId);
            setAttempt(data.attempt);
            setQuestions(data.questions);
            if (data.attempt.answers) {
                try {
                    const parsed = JSON.parse(data.attempt.answers) as AnswersMap;
                    setAnswers(parsed);
                } catch {
                    setAnswers({});
                }
            } else {
                setAnswers({});
            }
            const remain = Math.max(0, Math.floor((new Date(data.attempt.deadline).getTime() - Date.now()) / 1000));
            setTimeLeft(remain);
            setResult(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : '开始测验失败';
            Alert.alert('开始失败', message);
        }
    };

    const handleSubmit = async () => {
        if (!attempt || submitting) {
            return;
        }

        setSubmitting(true);
        try {
            const data = await submitQuiz(session.token, session.tokenType, quizId, answers);
            setResult({ score: data.score, max_score: data.max_score });
            setAttempt(data.attempt);
        } catch (err) {
            const message = err instanceof Error ? err.message : '提交失败';
            Alert.alert('提交失败', message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleTogglePublish = async () => {
        if (!quiz) {
            return;
        }

        try {
            if (quiz.is_published) {
                const updated = await unpublishQuiz(session.token, session.tokenType, quiz.ID);
                setQuiz(updated);
            } else {
                const updated = await publishQuiz(session.token, session.tokenType, quiz.ID);
                setQuiz(updated);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : '操作失败';
            Alert.alert('操作失败', message);
        }
    };

    const setAnswer = (questionId: number, value: AnswerValue) => {
        setAnswers((prev) => ({
            ...prev,
            [String(questionId)]: value,
        }));
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.centerText}>加载测验详情中...</Text>
            </View>
        );
    }

    if (error && !quiz) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={() => void loadQuiz()}>
                    <Text style={styles.retryButtonText}>重试</Text>
                </Pressable>
            </View>
        );
    }

    if (!quiz) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.centerText}>未找到测验</Text>
            </View>
        );
    }

    if (result) {
        return (
            <View style={styles.resultPage}>
                <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>测验已完成</Text>
                    <Text style={styles.resultScore}>{result.score} / {result.max_score}</Text>
                    <Text style={styles.resultRate}>正确率 {scoreRate}%</Text>
                    <Pressable style={styles.resultButton} onPress={() => void loadQuiz()}>
                        <Text style={styles.resultButtonText}>返回测验详情</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    const takingQuiz = !!attempt && !attempt.submitted_at;

    return (
        <ScrollView
            style={appStyles.page}
            contentContainerStyle={styles.pageContent}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void loadQuiz(true)}
                    tintColor={palette.primary}
                />
            }
        >
            <View style={styles.heroCard}>
                <View style={styles.heroHeader}>
                    <View style={styles.heroTitleWrap}>
                        <Text style={styles.heroTitle}>{quiz.title}</Text>
                        <Text style={styles.heroDesc}>{quiz.description || '暂无测验描述'}</Text>
                    </View>
                    {quiz.is_published ? (
                        <View style={[styles.statusBadge, styles.statusLive]}>
                            <Text style={styles.statusBadgeText}>进行中</Text>
                        </View>
                    ) : (
                        <View style={[styles.statusBadge, styles.statusDraft]}>
                            <Text style={styles.statusBadgeText}>草稿</Text>
                        </View>
                    )}
                </View>

                <View style={styles.quizMetaRow}>
                    <Text style={styles.metaText}>题目 {questions.length}</Text>
                    <Text style={styles.metaText}>总分 {quiz.total_points ?? 0}</Text>
                    <Text style={styles.metaText}>时限 {quiz.time_limit ?? 0} 分钟</Text>
                </View>

                {isTeacher ? (
                    <Pressable style={styles.publishButton} onPress={() => void handleTogglePublish()}>
                        <Text style={styles.publishButtonText}>{quiz.is_published ? '取消发布' : '发布测验'}</Text>
                    </Pressable>
                ) : null}
            </View>

            {!isTeacher && !takingQuiz ? (
                <View style={styles.startCard}>
                    {quiz.is_published ? (
                        <>
                            <Text style={styles.startTitle}>准备开始测验</Text>
                            <Text style={styles.startHint}>开始后将进入计时状态，请在限定时间内提交答案。</Text>
                            <Pressable style={styles.startButton} onPress={() => void handleStart()}>
                                <Text style={styles.startButtonText}>开始测验</Text>
                            </Pressable>
                        </>
                    ) : (
                        <Text style={styles.startHint}>测验尚未发布，请稍后再试。</Text>
                    )}
                </View>
            ) : null}

            {takingQuiz ? (
                <View style={styles.timerBar}>
                    <Text style={styles.timerLabel}>剩余时间</Text>
                    <Text style={[styles.timerValue, (timeLeft ?? 0) < 60 && styles.timerUrgent]}>
                        {timeLeft !== null ? formatRemain(timeLeft) : '--:--'}
                    </Text>
                </View>
            ) : null}

            <View style={styles.questionColumn}>
                {questions.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>当前测验暂无题目</Text>
                    </View>
                ) : (
                    questions.map((question, index) => (
                        <QuestionCard
                            key={question.ID}
                            question={question}
                            index={index}
                            answer={answers[String(question.ID)]}
                            disabled={!takingQuiz}
                            onChange={(value) => setAnswer(question.ID, value)}
                        />
                    ))
                )}
            </View>

            {takingQuiz ? (
                <Pressable
                    style={({ pressed }) => [
                        styles.submitButton,
                        submitting && styles.submitButtonDisabled,
                        pressed && !submitting && styles.submitButtonPressed,
                    ]}
                    onPress={() => void handleSubmit()}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color={palette.textPrimary} size="small" />
                    ) : (
                        <Text style={styles.submitButtonText}>提交答案</Text>
                    )}
                </Pressable>
            ) : null}
        </ScrollView>
    );
}

function QuestionCard({
    question,
    index,
    answer,
    disabled,
    onChange,
}: {
    question: Question | QuestionWithAnswer;
    index: number;
    answer: AnswerValue | undefined;
    disabled: boolean;
    onChange: (value: AnswerValue) => void;
}) {
    const qType = normalizeQuestionType(question);
    const options = parseQuestionOptions(question);

    const renderChoice = (option: string) => {
        const selected = Array.isArray(answer)
            ? answer.includes(option)
            : answer === option;

        return (
            <Pressable
                key={option}
                onPress={() => {
                    if (disabled) {
                        return;
                    }

                    if (qType === 'multiple_choice') {
                        const prev = Array.isArray(answer) ? answer : [];
                        if (prev.includes(option)) {
                            onChange(prev.filter((item) => item !== option));
                        } else {
                            onChange([...prev, option]);
                        }
                        return;
                    }

                    onChange(option);
                }}
                style={({ pressed }) => [
                    styles.optionItem,
                    selected && styles.optionItemActive,
                    pressed && !disabled && styles.optionItemPressed,
                    disabled && styles.optionItemDisabled,
                ]}
            >
                <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option}</Text>
            </Pressable>
        );
    };

    return (
        <View style={styles.questionCard}>
            <Text style={styles.questionTitle}>第 {index + 1} 题</Text>
            <Text style={styles.questionContent}>{question.content}</Text>

            {qType === 'single_choice' || qType === 'multiple_choice' ? (
                <View style={styles.optionColumn}>
                    {(qType === 'single_choice' && question.type === 'true_false'
                        ? ['正确', '错误']
                        : options
                    ).map(renderChoice)}
                </View>
            ) : (
                <TextInput
                    value={typeof answer === 'string' ? answer : ''}
                    onChangeText={(value) => onChange(value)}
                    editable={!disabled}
                    placeholder="请输入答案"
                    placeholderTextColor={palette.textMuted}
                    style={[styles.answerInput, disabled && styles.answerInputDisabled]}
                    multiline={qType === 'text'}
                    numberOfLines={qType === 'text' ? 4 : 1}
                    textAlignVertical={qType === 'text' ? 'top' : 'center'}
                />
            )}
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
        color: palette.textMuted,
        marginTop: spacing.sm,
        fontSize: 14,
    },
    errorText: {
        color: palette.danger,
        textAlign: 'center',
        fontSize: 14,
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
    heroCard: {
        ...appStyles.card,
        backgroundColor: palette.backgroundElevated,
        gap: spacing.md,
    },
    heroHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    heroTitleWrap: {
        flex: 1,
        gap: spacing.xs,
    },
    heroTitle: {
        color: palette.textPrimary,
        fontSize: 22,
        fontWeight: '700',
    },
    heroDesc: {
        color: palette.textSecondary,
        fontSize: 14,
        lineHeight: 21,
    },
    statusBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        borderRadius: radius.full,
        alignSelf: 'flex-start',
    },
    statusLive: {
        backgroundColor: '#14532d',
    },
    statusDraft: {
        backgroundColor: '#374151',
    },
    statusBadgeText: {
        color: palette.textPrimary,
        fontSize: 11,
        fontWeight: '700',
    },
    quizMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
    },
    metaText: {
        color: palette.textMuted,
        fontSize: 12,
    },
    publishButton: {
        alignSelf: 'flex-start',
        backgroundColor: palette.primary,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    publishButtonText: {
        color: palette.textPrimary,
        fontWeight: '700',
        fontSize: 13,
    },
    startCard: {
        ...appStyles.card,
        alignItems: 'center',
        gap: spacing.sm,
    },
    startTitle: {
        color: palette.textPrimary,
        fontSize: 18,
        fontWeight: '700',
    },
    startHint: {
        color: palette.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
    startButton: {
        marginTop: spacing.xs,
        backgroundColor: palette.primary,
        borderRadius: radius.md,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.sm,
    },
    startButtonText: {
        color: palette.textPrimary,
        fontWeight: '700',
        fontSize: 14,
    },
    timerBar: {
        ...appStyles.card,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    timerLabel: {
        color: palette.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    timerValue: {
        color: palette.accentCyan,
        fontSize: 22,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    timerUrgent: {
        color: palette.danger,
    },
    questionColumn: {
        gap: spacing.sm,
    },
    questionCard: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    questionTitle: {
        color: palette.accentCyan,
        fontSize: 12,
        fontWeight: '700',
    },
    questionContent: {
        color: palette.textPrimary,
        fontSize: 15,
        lineHeight: 22,
    },
    optionColumn: {
        gap: spacing.xs,
    },
    optionItem: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        backgroundColor: palette.background,
    },
    optionItemActive: {
        borderColor: palette.primary,
        backgroundColor: '#1d4ed833',
    },
    optionItemPressed: {
        opacity: 0.8,
    },
    optionItemDisabled: {
        opacity: 0.7,
    },
    optionText: {
        color: palette.textSecondary,
        fontSize: 13,
    },
    optionTextActive: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    answerInput: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        fontSize: 14,
        minHeight: 44,
    },
    answerInputDisabled: {
        opacity: 0.7,
    },
    submitButton: {
        minHeight: 48,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButtonDisabled: {
        opacity: 0.55,
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
        minHeight: 120,
        justifyContent: 'center',
    },
    emptyText: {
        color: palette.textMuted,
    },
    resultPage: {
        ...appStyles.page,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    resultCard: {
        ...appStyles.card,
        width: '100%',
        maxWidth: 420,
        alignItems: 'center',
        gap: spacing.sm,
    },
    resultTitle: {
        color: palette.textPrimary,
        fontSize: 22,
        fontWeight: '700',
    },
    resultScore: {
        color: palette.accentCyan,
        fontSize: 34,
        fontWeight: '800',
    },
    resultRate: {
        color: palette.textSecondary,
        fontSize: 14,
    },
    resultButton: {
        marginTop: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
    },
    resultButtonText: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
});
