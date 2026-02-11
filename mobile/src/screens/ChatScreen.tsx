import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { chat } from '../api';
import { DEFAULT_CHAT_MODE, EDGE_ROUTER_ENGINE, MAX_CONTEXT_MESSAGES } from '../config';
import { decideRouteWithRust } from '../rustBridge';
import type { AuthSession, ChatMessage } from '../types';
import MessageBubble from '../components/MessageBubble';
import { appStyles, palette, radius, spacing } from '../theme';

type ChatScreenProps = {
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

export default function ChatScreen({ session, messages, setMessages }: ChatScreenProps) {
    const [input, setInput] = useState('');
    const [mode, setMode] = useState(DEFAULT_CHAT_MODE);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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

    const canSend = input.trim().length > 0 && !loading;

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
    };

    const handleSend = async () => {
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
                }
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
});
