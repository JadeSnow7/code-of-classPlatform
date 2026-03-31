import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { chat, getCourses } from '../api';
import { DEFAULT_CHAT_MODE, EDGE_ROUTER_ENGINE, MAX_CONTEXT_MESSAGES } from '../config';
import type { ChatStackParamList } from '../navigation/AppNavigator';
import { decideRouteWithRust } from '../rustBridge';
import type { AuthSession, ChatMessage, Course } from '../types';
import MessageBubble from '../components/MessageBubble';
import { appStyles, palette, radius, spacing } from '../theme';

type ChatScreenProps = NativeStackScreenProps<ChatStackParamList, 'ChatMain'> & {
    session: AuthSession;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
};

type ModeOption = {
    key: string;
    label: string;
};

const MODE_OPTIONS: ModeOption[] = [
    { key: 'tutor', label: '导师' },
    { key: 'problem_solver', label: '解题' },
    { key: 'sim_explain', label: '模拟' },
];

function createId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ChatScreen({ route, session, messages, setMessages }: ChatScreenProps) {
    const preselectedCourseId = route.params?.courseId;
    const [input, setInput] = useState('');
    const [mode, setMode] = useState(DEFAULT_CHAT_MODE);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [courses, setCourses] = useState<Course[]>([]);
    const [coursePickerVisible, setCoursePickerVisible] = useState(false);
    const [courseLoading, setCourseLoading] = useState(true);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const listRef = useRef<FlatList<ChatMessage>>(null);
    const abortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
            abortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            listRef.current?.scrollToEnd({ animated: true });
        }, 80);
        return () => clearTimeout(timeoutId);
    }, [messages.length]);

    useEffect(() => {
        let cancelled = false;

        const loadCourses = async () => {
            setCourseLoading(true);
            try {
                const data = await getCourses(session.token, session.tokenType);
                if (!cancelled) {
                    setCourses(data);
                    if (preselectedCourseId) {
                        const match = data.find((c) => c.ID === preselectedCourseId);
                        if (match) setSelectedCourse(match);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load courses');
                }
            } finally {
                if (!cancelled) {
                    setCourseLoading(false);
                }
            }
        };

        void loadCourses();

        return () => {
            cancelled = true;
        };
    }, [session.token, session.tokenType, preselectedCourseId]);

    const canSend = input.trim().length > 0 && !loading && !!selectedCourse;

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
    };

    const handleSelectCourse = (course: Course) => {
        setSelectedCourse(course);
        setCoursePickerVisible(false);
        setError(null);
    };

    const handleSend = async () => {
        if (!selectedCourse) {
            setError('请先选择课程后再提问');
            return;
        }
        if (!canSend) {
            return;
        }

        const content = input.trim();
        const userMessage: ChatMessage = {
            id: createId(),
            role: 'user',
            content,
            createdAt: Date.now(),
        };

        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setInput('');
        setError(null);
        setLoading(true);

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        try {
            let route: 'local' | 'cloud' | 'auto' = 'local';
            if (EDGE_ROUTER_ENGINE === 'rust') {
                const decision = await decideRouteWithRust({
                    privacy_level: 'private',
                    user_preference: 'balanced',
                    device_load: 0.5,
                    device_context: {
                        memory_available_mb: 1024,
                    },
                    network_rtt_ms: 120,
                    local_model_ready: true,
                    cloud_model_ready: true,
                });
                if (decision?.route) {
                    route = decision.route;
                }
            }

            const responseText = await chat(
                session.token,
                session.tokenType,
                nextMessages.slice(-MAX_CONTEXT_MESSAGES),
                mode,
                controller.signal,
                {
                    privacy: 'private',
                    route,
                },
                selectedCourse.ID
            );

            if (!mountedRef.current || requestId !== requestIdRef.current) {
                return;
            }

            const assistantMessage: ChatMessage = {
                id: createId(),
                role: 'assistant',
                content: responseText,
                createdAt: Date.now(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (err) {
            if (!mountedRef.current || requestId !== requestIdRef.current) {
                return;
            }

            const message = err instanceof Error ? err.message : 'Request failed';
            if (message !== 'Request canceled') {
                setError(message);
            }
        } finally {
            if (!mountedRef.current || requestId !== requestIdRef.current) {
                return;
            }

            setLoading(false);
            abortRef.current = null;
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.modeRow}>
                {MODE_OPTIONS.map((option, index) => {
                    const isActive = option.key === mode;
                    return (
                        <Pressable
                            key={option.key}
                            onPress={() => setMode(option.key)}
                            style={({ pressed }) => [
                                styles.modeChip,
                                index < MODE_OPTIONS.length - 1 && styles.modeChipSpacing,
                                isActive ? styles.modeChipActive : styles.modeChipIdle,
                                pressed && styles.modeChipPressed,
                            ]}
                        >
                            <Text style={[styles.modeText, isActive ? styles.modeTextActive : styles.modeTextIdle]}>
                                {option.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.courseSelectorWrap}>
                <Pressable
                    style={({ pressed }) => [
                        styles.courseSelector,
                        pressed && styles.courseSelectorPressed,
                    ]}
                    onPress={() => setCoursePickerVisible(true)}
                >
                    <View style={styles.courseSelectorCopy}>
                        <Text style={styles.courseSelectorLabel}>当前课程</Text>
                        <Text
                            style={[
                                styles.courseSelectorValue,
                                !selectedCourse && styles.courseSelectorValueMuted,
                            ]}
                        >
                            {courseLoading ? '加载课程中...' : selectedCourse ? selectedCourse.name : '请选择课程'}
                        </Text>
                    </View>
                    {courseLoading ? (
                        <ActivityIndicator size="small" color={palette.primary} />
                    ) : (
                        <Text style={styles.courseSelectorAction}>{selectedCourse ? '切换' : '选择'}</Text>
                    )}
                </Pressable>
                {!selectedCourse && !courseLoading ? (
                    <Text style={styles.courseHint}>未选择课程前不能发送消息。</Text>
                ) : null}
            </View>

            {error ? (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : null}

            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <MessageBubble message={item} />}
                contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>开始学习对话</Text>
                        <Text style={styles.emptyText}>发送你的问题，AI 助教会给出即时解答。</Text>
                    </View>
                }
                ListFooterComponent={
                    loading ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={palette.primary} style={styles.loadingIndicator} />
                            <Text style={styles.loadingText}>AI 正在思考...</Text>
                        </View>
                    ) : (
                        <View style={styles.footerSpace} />
                    )
                }
            />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.inputWrap}>
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        placeholder="请输入问题..."
                        placeholderTextColor={palette.textMuted}
                        multiline
                        style={styles.input}
                        editable={!loading}
                    />

                    {loading ? (
                        <Pressable
                            style={({ pressed }) => [styles.stopButton, pressed && styles.stopButtonPressed]}
                            onPress={handleStop}
                        >
                            <Text style={styles.stopButtonText}>停止</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            style={({ pressed }) => [
                                styles.sendButton,
                                !canSend && styles.sendButtonDisabled,
                                pressed && canSend && styles.sendButtonPressed,
                            ]}
                            onPress={() => void handleSend()}
                            disabled={!canSend}
                        >
                            <Text style={styles.sendButtonText}>发送</Text>
                        </Pressable>
                    )}
                </View>
            </KeyboardAvoidingView>

            <Modal
                visible={coursePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setCoursePickerVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <Pressable style={styles.modalDismissArea} onPress={() => setCoursePickerVisible(false)} />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>选择课程</Text>
                        {courseLoading ? (
                            <View style={styles.modalLoadingState}>
                                <ActivityIndicator size="small" color={palette.primary} />
                                <Text style={styles.modalInfoText}>课程列表加载中...</Text>
                            </View>
                        ) : courses.length === 0 ? (
                            <Text style={styles.modalInfoText}>暂无可用课程</Text>
                        ) : (
                            <View style={styles.courseOptionList}>
                                {courses.map((course) => {
                                    const isActive = selectedCourse?.ID === course.ID;
                                    return (
                                        <Pressable
                                            key={course.ID}
                                            onPress={() => handleSelectCourse(course)}
                                            style={({ pressed }) => [
                                                styles.courseOption,
                                                isActive && styles.courseOptionActive,
                                                pressed && styles.courseOptionPressed,
                                            ]}
                                        >
                                            <Text style={styles.courseOptionTitle}>{course.name}</Text>
                                            <Text style={styles.courseOptionMeta}>
                                                {course.teacher_name || `教师 #${course.teacher_id}`}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}
                        <Pressable style={styles.modalCloseButton} onPress={() => setCoursePickerVisible(false)}>
                            <Text style={styles.modalCloseButtonText}>关闭</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...appStyles.page,
    },
    modeRow: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: 6,
    },
    modeChip: {
        paddingVertical: 7,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.full,
        borderWidth: 1,
    },
    modeChipSpacing: {
        marginRight: spacing.xs,
    },
    modeChipIdle: {
        backgroundColor: palette.backgroundMuted,
        borderColor: palette.border,
    },
    modeChipActive: {
        backgroundColor: palette.primary,
        borderColor: palette.primary,
    },
    modeChipPressed: {
        opacity: 0.86,
    },
    modeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    modeTextIdle: {
        color: palette.textSecondary,
    },
    modeTextActive: {
        color: palette.textPrimary,
    },
    courseSelectorWrap: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.xs,
    },
    courseSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: palette.backgroundPanel,
        borderWidth: 1,
        borderColor: palette.border,
    },
    courseSelectorPressed: {
        opacity: 0.9,
    },
    courseSelectorCopy: {
        flex: 1,
        marginRight: spacing.sm,
    },
    courseSelectorLabel: {
        color: palette.textMuted,
        fontSize: 12,
        marginBottom: 2,
    },
    courseSelectorValue: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    courseSelectorValueMuted: {
        color: palette.textMuted,
    },
    courseSelectorAction: {
        color: palette.primary,
        fontSize: 13,
        fontWeight: '700',
    },
    courseHint: {
        marginTop: 6,
        color: palette.textMuted,
        fontSize: 12,
    },
    errorBanner: {
        marginHorizontal: spacing.md,
        marginTop: 6,
        backgroundColor: '#450a0a',
        borderRadius: radius.md,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderWidth: 1,
        borderColor: '#7f1d1d',
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 12,
    },
    list: {
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
    },
    emptyList: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    emptyState: {
        alignItems: 'center',
        gap: 6,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    emptyText: {
        textAlign: 'center',
        color: palette.textMuted,
        lineHeight: 21,
        fontSize: 13,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    loadingIndicator: {
        marginRight: spacing.xs,
    },
    loadingText: {
        color: palette.textMuted,
        fontSize: 12,
    },
    footerSpace: {
        height: 8,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        backgroundColor: palette.background,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        gap: spacing.xs,
    },
    input: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: palette.backgroundPanel,
        borderWidth: 1,
        borderColor: palette.border,
        color: palette.textPrimary,
        fontSize: 14,
    },
    sendButton: {
        backgroundColor: palette.primary,
        minHeight: 44,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        justifyContent: 'center',
    },
    sendButtonPressed: {
        opacity: 0.86,
    },
    sendButtonDisabled: {
        backgroundColor: palette.primaryMuted,
        opacity: 0.5,
    },
    sendButtonText: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    stopButton: {
        backgroundColor: '#b91c1c',
        minHeight: 44,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        justifyContent: 'center',
    },
    stopButtonPressed: {
        opacity: 0.85,
    },
    stopButtonText: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(2, 6, 23, 0.72)',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    modalDismissArea: {
        ...StyleSheet.absoluteFillObject,
    },
    modalCard: {
        backgroundColor: palette.backgroundPanel,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.border,
        padding: spacing.md,
        gap: spacing.sm,
    },
    modalTitle: {
        color: palette.textPrimary,
        fontSize: 18,
        fontWeight: '700',
    },
    modalLoadingState: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    modalInfoText: {
        color: palette.textMuted,
        fontSize: 13,
    },
    courseOptionList: {
        gap: spacing.xs,
    },
    courseOption: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.backgroundMuted,
    },
    courseOptionActive: {
        borderColor: palette.primary,
        backgroundColor: palette.primaryMuted,
    },
    courseOptionPressed: {
        opacity: 0.88,
    },
    courseOptionTitle: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    courseOptionMeta: {
        color: palette.textMuted,
        fontSize: 12,
        marginTop: 4,
    },
    modalCloseButton: {
        alignSelf: 'flex-end',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    modalCloseButtonText: {
        color: palette.primary,
        fontSize: 13,
        fontWeight: '700',
    },
});
