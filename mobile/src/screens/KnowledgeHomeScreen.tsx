import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getCourses } from '../api';
import type { AuthSession, Course } from '../types';
import type { KnowledgeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<KnowledgeStackParamList, 'KnowledgeHome'> & {
    session: AuthSession;
};

export default function KnowledgeHomeScreen({ navigation, session }: Props) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const data = await getCourses(session.token, session.tokenType);
            setCourses(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.token, session.tokenType]);

    useEffect(() => { void load(); }, [load]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={palette.primary} />
            </View>
        );
    }

    return (
        <FlatList
            style={appStyles.page}
            data={courses}
            keyExtractor={(item) => String(item.ID ?? item.id)}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.primary} />
            }
            contentContainerStyle={styles.list}
            ListHeaderComponent={
                error ? <Text style={styles.errorText}>{error}</Text> : null
            }
            ListEmptyComponent={
                <Text style={styles.emptyText}>暂无课程</Text>
            }
            renderItem={({ item }) => (
                <Pressable
                    style={({ pressed }) => [styles.courseCard, pressed && styles.courseCardPressed]}
                    onPress={() =>
                        navigation.navigate('KnowledgeCourse', {
                            courseId: item.ID ?? item.id ?? 0,
                            courseTitle: item.name,
                        })
                    }
                >
                    <View style={styles.courseCardBody}>
                        <Text style={styles.courseName}>{item.name}</Text>
                        <Text style={styles.courseMeta}>
                            {item.teacher_name || `教师 #${item.teacher_id}`}
                        </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                </Pressable>
            )}
        />
    );
}

const styles = StyleSheet.create({
    center: {
        ...appStyles.page,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        padding: spacing.md,
        gap: spacing.sm,
        paddingBottom: spacing.xxl,
    },
    errorText: {
        color: palette.danger,
        fontSize: 13,
        marginBottom: spacing.sm,
    },
    emptyText: {
        color: palette.textMuted,
        fontSize: 14,
        textAlign: 'center',
        marginTop: spacing.xl,
    },
    courseCard: {
        ...appStyles.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    courseCardPressed: {
        opacity: 0.88,
    },
    courseCardBody: {
        flex: 1,
        gap: 2,
    },
    courseName: {
        color: palette.textPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    courseMeta: {
        color: palette.textMuted,
        fontSize: 12,
    },
    chevron: {
        color: palette.textMuted,
        fontSize: 22,
        fontWeight: '300',
    },
});
