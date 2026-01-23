import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getChapterContent, recordStudyTime } from '../api';
import type { AuthSession, Chapter } from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<HomeStackParamList, 'ChapterContent'> & {
    session: AuthSession;
};

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

export default function ChapterContentScreen({ route, session }: Props) {
    const { chapterId, title } = route.params;
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [studySeconds, setStudySeconds] = useState(0);

    const startTimeRef = useRef(Date.now());
    const lastHeartbeatRef = useRef(Date.now());
    const isActiveRef = useRef(true);

    // Fetch chapter content
    useEffect(() => {
        const fetchContent = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getChapterContent(session.token, session.tokenType, chapterId);
                setChapter(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load chapter');
            } finally {
                setLoading(false);
            }
        };
        fetchContent();
    }, [chapterId]);

    // Study time tracking
    useEffect(() => {
        startTimeRef.current = Date.now();
        lastHeartbeatRef.current = Date.now();
        isActiveRef.current = true;

        const handleAppStateChange = (nextState: string) => {
            if (nextState === 'active') {
                isActiveRef.current = true;
                startTimeRef.current = Date.now();
            } else {
                isActiveRef.current = false;
                sendHeartbeat();
            }
        };

        const sendHeartbeat = async () => {
            const now = Date.now();
            const elapsed = Math.floor((now - lastHeartbeatRef.current) / 1000);
            if (elapsed > 0 && isActiveRef.current) {
                try {
                    await recordStudyTime(session.token, session.tokenType, chapterId, elapsed);
                    setStudySeconds((prev) => prev + elapsed);
                    lastHeartbeatRef.current = now;
                } catch {
                    // Ignore heartbeat errors
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

        return () => {
            subscription.remove();
            clearInterval(intervalId);
            // Send final heartbeat on unmount
            sendHeartbeat();
        };
    }, [chapterId]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#60a5fa" />
                <Text style={styles.loadingText}>加载章节内容中...</Text>
            </View>
        );
    }

    if (error || !chapter) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error || '章节不存在'}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Study time indicator */}
            <View style={styles.studyBar}>
                <Text style={styles.studyLabel}>📖 本次学习时长</Text>
                <Text style={styles.studyTime}>{formatTime(studySeconds)}</Text>
            </View>

            {/* Content */}
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.chapterTitle}>{chapter.title}</Text>
                {chapter.description && (
                    <Text style={styles.description}>{chapter.description}</Text>
                )}
                <View style={styles.divider} />
                <Text style={styles.content}>{chapter.content || '暂无内容'}</Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0b1220',
    },
    center: {
        flex: 1,
        backgroundColor: '#0b1220',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    loadingText: {
        color: '#94a3b8',
        marginTop: 12,
        fontSize: 14,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 14,
        textAlign: 'center',
    },
    studyBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#065f46',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    studyLabel: {
        color: '#a7f3d0',
        fontSize: 13,
    },
    studyTime: {
        color: '#10b981',
        fontSize: 16,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    chapterTitle: {
        color: '#f8fafc',
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 8,
    },
    description: {
        color: '#94a3b8',
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 12,
    },
    divider: {
        height: 1,
        backgroundColor: '#334155',
        marginVertical: 16,
    },
    content: {
        color: '#cbd5e1',
        fontSize: 15,
        lineHeight: 26,
    },
});
