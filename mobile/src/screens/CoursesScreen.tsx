import { useEffect, useState } from 'react';
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
import type { HomeStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<HomeStackParamList, 'Courses'> & {
    session: AuthSession;
};

export default function CoursesScreen({ navigation, session }: Props) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchCourses = async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const data = await getCourses(session.token, session.tokenType);
            setCourses(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load courses');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchCourses();
    }, []);

    const handleCoursePress = (course: Course) => {
        navigation.navigate('CourseDetail', { course });
    };

    const renderCourse = ({ item }: { item: Course }) => (
        <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => handleCoursePress(item)}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.courseName}>{item.name}</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.student_count || 0} 人</Text>
                </View>
            </View>
            <Text style={styles.courseDesc} numberOfLines={2}>
                {item.description || '暂无描述'}
            </Text>
            <View style={styles.cardFooter}>
                <Text style={styles.teacherName}>👨‍🏫 {item.teacher_name || '未知教师'}</Text>
                <Text style={styles.arrow}>›</Text>
            </View>
        </Pressable>
    );

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#60a5fa" />
                <Text style={styles.loadingText}>加载课程中...</Text>
            </View>
        );
    }

    if (error && courses.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryBtn} onPress={() => fetchCourses()}>
                    <Text style={styles.retryText}>重试</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={courses}
                keyExtractor={(item) => (item.ID || item.id || Math.random()).toString()}
                renderItem={renderCourse}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => fetchCourses(true)}
                        tintColor="#60a5fa"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>暂无课程</Text>
                    </View>
                }
            />
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
        marginBottom: 16,
    },
    retryBtn: {
        backgroundColor: '#1e40af',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
    },
    retryText: {
        color: '#fff',
        fontWeight: '600',
    },
    list: {
        padding: 16,
        gap: 12,
    },
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    cardPressed: {
        opacity: 0.85,
        backgroundColor: '#263548',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    courseName: {
        fontSize: 17,
        fontWeight: '600',
        color: '#f8fafc',
        flex: 1,
    },
    badge: {
        backgroundColor: '#0d9488',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 10,
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
    courseDesc: {
        color: '#94a3b8',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 12,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    teacherName: {
        color: '#64748b',
        fontSize: 12,
    },
    arrow: {
        color: '#475569',
        fontSize: 22,
        fontWeight: '300',
    },
    empty: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        color: '#64748b',
        fontSize: 15,
    },
});
