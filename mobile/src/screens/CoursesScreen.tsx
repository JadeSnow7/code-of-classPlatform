import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { createCourse, getCourses } from '../api';
import type { AuthSession, Course } from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'Courses'> & {
    session: AuthSession;
};

export default function CoursesScreen({ navigation, session }: Props) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCode, setNewCode] = useState('');
    const [newSemester, setNewSemester] = useState('');
    const [creating, setCreating] = useState(false);

    const canCreate = session.user.role === 'teacher' || session.user.role === 'admin';

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
        void fetchCourses();
    }, []);

    const handleCoursePress = (course: Course) => {
        navigation.navigate('CourseDetail', { course });
    };

    const handleCreateCourse = async () => {
        if (!newName.trim() || creating) {
            return;
        }

        setCreating(true);
        try {
            await createCourse(session.token, session.tokenType, {
                name: newName.trim(),
                code: newCode.trim() || undefined,
                semester: newSemester.trim() || undefined,
            });
            setNewName('');
            setNewCode('');
            setNewSemester('');
            setShowCreateModal(false);
            await fetchCourses(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : '创建课程失败');
        } finally {
            setCreating(false);
        }
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
                <Text style={styles.teacherName}>教师 {item.teacher_name || `#${item.teacher_id}`}</Text>
                <Text style={styles.arrow}>›</Text>
            </View>
        </Pressable>
    );

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.loadingText}>加载课程中...</Text>
            </View>
        );
    }

    if (error && courses.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryBtn} onPress={() => void fetchCourses()}>
                    <Text style={styles.retryText}>重试</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {canCreate ? (
                <View style={styles.topBar}>
                    <Pressable style={styles.createButton} onPress={() => setShowCreateModal(true)}>
                        <Text style={styles.createButtonText}>创建课程</Text>
                    </Pressable>
                </View>
            ) : null}

            <FlatList
                data={courses}
                keyExtractor={(item) => String(item.ID || item.id || Math.random())}
                renderItem={renderCourse}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => void fetchCourses(true)}
                        tintColor={palette.primary}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>暂无课程</Text>
                        <Text style={styles.emptyText}>{canCreate ? '点击上方按钮创建课程' : '等待教师添加课程'}</Text>
                    </View>
                }
            />

            <Modal
                visible={showCreateModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowCreateModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>创建课程</Text>
                        <TextInput
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="课程名称"
                            placeholderTextColor={palette.textMuted}
                            style={styles.modalInput}
                        />
                        <TextInput
                            value={newCode}
                            onChangeText={setNewCode}
                            placeholder="课程代码（可选）"
                            placeholderTextColor={palette.textMuted}
                            style={styles.modalInput}
                        />
                        <TextInput
                            value={newSemester}
                            onChangeText={setNewSemester}
                            placeholder="学期（可选）"
                            placeholderTextColor={palette.textMuted}
                            style={styles.modalInput}
                        />

                        <View style={styles.modalActions}>
                            <Pressable style={styles.modalCancelButton} onPress={() => setShowCreateModal(false)}>
                                <Text style={styles.modalCancelText}>取消</Text>
                            </Pressable>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.modalSubmitButton,
                                    (!newName.trim() || creating) && styles.modalSubmitDisabled,
                                    pressed && newName.trim() && !creating && styles.modalSubmitPressed,
                                ]}
                                onPress={() => void handleCreateCourse()}
                                disabled={!newName.trim() || creating}
                            >
                                {creating ? (
                                    <ActivityIndicator size="small" color={palette.textPrimary} />
                                ) : (
                                    <Text style={styles.modalSubmitText}>创建</Text>
                                )}
                            </Pressable>
                        </View>
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
    topBar: {
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
    },
    createButton: {
        alignSelf: 'flex-start',
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    createButtonText: {
        color: palette.textPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    center: {
        ...appStyles.page,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    loadingText: {
        color: palette.textMuted,
        marginTop: spacing.sm,
        fontSize: 13,
    },
    errorText: {
        color: palette.danger,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    retryBtn: {
        backgroundColor: palette.primaryMuted,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
    },
    retryText: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    list: {
        padding: spacing.md,
        gap: spacing.sm,
        paddingBottom: spacing.xxl,
    },
    card: {
        ...appStyles.card,
        backgroundColor: palette.backgroundPanel,
    },
    cardPressed: {
        opacity: 0.86,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xs,
        gap: spacing.sm,
    },
    courseName: {
        fontSize: 17,
        fontWeight: '700',
        color: palette.textPrimary,
        flex: 1,
    },
    badge: {
        backgroundColor: '#0f766e',
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radius.full,
    },
    badgeText: {
        color: '#ccfbf1',
        fontSize: 11,
        fontWeight: '700',
    },
    courseDesc: {
        color: palette.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        marginBottom: spacing.sm,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    teacherName: {
        color: palette.textMuted,
        fontSize: 12,
    },
    arrow: {
        color: palette.textMuted,
        fontSize: 21,
    },
    empty: {
        alignItems: 'center',
        paddingVertical: 64,
    },
    emptyTitle: {
        color: palette.textSecondary,
        fontSize: 16,
        fontWeight: '700',
        marginBottom: spacing.xs,
    },
    emptyText: {
        color: palette.textMuted,
        fontSize: 13,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: '#000000aa',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
    },
    modalCard: {
        ...appStyles.card,
        backgroundColor: palette.backgroundElevated,
        gap: spacing.sm,
    },
    modalTitle: {
        color: palette.textPrimary,
        fontSize: 18,
        fontWeight: '700',
    },
    modalInput: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        fontSize: 14,
    },
    modalActions: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    modalCancelButton: {
        flex: 1,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
    },
    modalCancelText: {
        color: palette.textSecondary,
        fontWeight: '600',
    },
    modalSubmitButton: {
        flex: 1,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
    },
    modalSubmitDisabled: {
        opacity: 0.6,
    },
    modalSubmitPressed: {
        opacity: 0.85,
    },
    modalSubmitText: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
});
