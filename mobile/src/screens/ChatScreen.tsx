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
import { DEFAULT_CHAT_MODE, MAX_CONTEXT_MESSAGES } from '../config';
import type { AuthSession, ChatMessage } from '../types';
import MessageBubble from '../components/MessageBubble';

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

    const handleSend = async () => {
        if (!canSend) return;

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
            const responseText = await chat(
                session.token,
                session.tokenType,
                nextMessages.slice(-MAX_CONTEXT_MESSAGES),
                mode,
                controller.signal
            );

            if (!mountedRef.current || requestId !== requestIdRef.current) return;

            const assistantMessage: ChatMessage = {
                id: createId(),
                role: 'assistant',
                content: responseText,
                createdAt: Date.now(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (err) {
            if (!mountedRef.current || requestId !== requestIdRef.current) return;

            const message = err instanceof Error ? err.message : 'Request failed';
            if (message !== 'Request canceled') {
                setError(message);
            }
        } finally {
            if (!mountedRef.current || requestId !== requestIdRef.current) return;

            setLoading(false);
            abortRef.current = null;
        }
    };

    return (
        <View style={styles.container}>
            {/* Mode selector */}
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

            {/* Error banner */}
            {error && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {/* Messages list */}
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
                        <Text style={styles.emptyText}>
                            发送问题，AI 助教将为你解答。{'\n'}消息会保存在本地。
                        </Text>
                    </View>
                }
                ListFooterComponent={
                    loading ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color="#60a5fa" style={styles.loadingIndicator} />
                            <Text style={styles.loadingText}>AI 正在思考...</Text>
                        </View>
                    ) : (
                        <View style={styles.footerSpace} />
                    )
                }
            />

            {/* Input area */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.inputWrap}>
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        placeholder="请输入问题..."
                        placeholderTextColor="#94a3b8"
                        multiline
                        style={styles.input}
                        editable={!loading}
                    />
                    <Pressable
                        style={({ pressed }) => [
                            styles.sendButton,
                            !canSend && styles.sendButtonDisabled,
                            pressed && canSend && styles.sendButtonPressed,
                        ]}
                        onPress={handleSend}
                        disabled={!canSend}
                    >
                        <Text style={styles.sendButtonText}>发送</Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0b1220',
    },
    modeRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    modeChip: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 999,
    },
    modeChipSpacing: {
        marginRight: 10,
    },
    modeChipIdle: {
        backgroundColor: '#111827',
        borderWidth: 1,
        borderColor: '#1f2937',
    },
    modeChipActive: {
        backgroundColor: '#1d4ed8',
    },
    modeChipPressed: {
        opacity: 0.85,
    },
    modeText: {
        fontSize: 13,
        fontWeight: '600',
    },
    modeTextIdle: {
        color: '#cbd5e1',
    },
    modeTextActive: {
        color: '#f8fafc',
    },
    errorBanner: {
        marginHorizontal: 16,
        marginTop: 6,
        backgroundColor: '#450a0a',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 12,
    },
    list: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
    },
    emptyList: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    emptyState: {
        alignItems: 'center',
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#f8fafc',
        marginBottom: 8,
    },
    emptyText: {
        textAlign: 'center',
        color: '#94a3b8',
        lineHeight: 22,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    loadingIndicator: {
        marginRight: 10,
    },
    loadingText: {
        color: '#94a3b8',
        fontSize: 12,
    },
    footerSpace: {
        height: 6,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#0b1220',
        borderTopWidth: 1,
        borderTopColor: '#1f2937',
    },
    input: {
        flex: 1,
        minHeight: 42,
        maxHeight: 120,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#1e293b',
        color: '#f8fafc',
        fontSize: 15,
    },
    sendButton: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        marginLeft: 10,
    },
    sendButtonPressed: {
        opacity: 0.85,
    },
    sendButtonDisabled: {
        backgroundColor: '#1e40af',
        opacity: 0.5,
    },
    sendButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
});
