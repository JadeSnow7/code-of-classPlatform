import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getChapters, getAssignments, getQuizzes, getResources } from '../api';
import type { AuthSession, Chapter, Assignment, Quiz, Resource } from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import CreateItemScreen from './CreateItemScreen';

type Props = NativeStackScreenProps<HomeStackParamList, 'CourseDetail'> & {
    session: AuthSession;
};

type TabKey = 'chapters' | 'assignments' | 'quizzes' | 'resources';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'chapters', label: '章节' },
    { key: 'assignments', label: '作业' },
    { key: 'quizzes', label: '测验' },
    { key: 'resources', label: '资源' },
];

export default function CourseDetailScreen({ navigation, route, session }: Props) {
    const { course } = route.params;
    const [activeTab, setActiveTab] = useState<TabKey>('chapters');
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createType, setCreateType] = useState<'assignment' | 'quiz' | 'resource'>('assignment');

    const isTeacher = session.user.role === 'teacher' || session.user.role === 'admin';

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [chaptersData, assignmentsData, quizzesData, resourcesData] = await Promise.all([
                getChapters(session.token, session.tokenType, course.ID),
                getAssignments(session.token, session.tokenType, course.ID),
                getQuizzes(session.token, session.tokenType, course.ID),
                getResources(session.token, session.tokenType, course.ID),
            ]);
            setChapters(chaptersData);
            setAssignments(assignmentsData);
            setQuizzes(quizzesData);
            setResources(resourcesData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [course.ID]);

    const handleChapterPress = (chapter: Chapter) => {
        navigation.navigate('ChapterContent', { chapterId: chapter.ID, title: chapter.title });
    };

    const renderChapter = ({ item, index }: { item: Chapter; index: number }) => (
        <Pressable
            style={({ pressed }) => [styles.listItem, pressed && styles.listItemPressed]}
            onPress={() => handleChapterPress(item)}
        >
            <View style={styles.itemIndex}>
                <Text style={styles.indexText}>{index + 1}</Text>
            </View>
            <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDesc} numberOfLines={1}>{item.description || '暂无描述'}</Text>
            </View>
            {item.study_time_seconds && item.study_time_seconds > 0 && (
                <View style={styles.studyTimeBadge}>
                    <Text style={styles.studyTimeText}>
                        {Math.floor(item.study_time_seconds / 60)}分钟
                    </Text>
                </View>
            )}
            <Text style={styles.listArrow}>›</Text>
        </Pressable>
    );

    const renderAssignment = ({ item }: { item: Assignment }) => (
        <View style={styles.listItem}>
            <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDesc}>截止：{new Date(item.due_date).toLocaleDateString()}</Text>
            </View>
            <View style={[styles.statusBadge, item.status === 'graded' ? styles.successBadge : item.status === 'submitted' ? styles.warningBadge : styles.pendingBadge]}>
                <Text style={styles.statusText}>
                    {item.status === 'graded' ? '已批改' : item.status === 'submitted' ? '已提交' : '待提交'}
                </Text>
            </View>
        </View>
    );

    const renderQuiz = ({ item }: { item: Quiz }) => (
        <View style={styles.listItem}>
            <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.time_limit_minutes && (
                    <Text style={styles.itemDesc}>时限：{item.time_limit_minutes}分钟</Text>
                )}
            </View>
            <View style={[styles.statusBadge, item.status === 'completed' ? styles.successBadge : styles.pendingBadge]}>
                <Text style={styles.statusText}>
                    {item.status === 'completed' ? `${item.score}/${item.max_score}` : '未完成'}
                </Text>
            </View>
        </View>
    );

    const renderResource = ({ item }: { item: Resource }) => (
        <View style={styles.listItem}>
            <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.name}</Text>
                <Text style={styles.itemDesc}>
                    {(item.file_type || 'FILE').toUpperCase()} · {((item.file_size || 0) / 1024).toFixed(1)} KB
                </Text>
            </View>
            <Text style={styles.downloadIcon}>📥</Text>
        </View>
    );

    const renderTabContent = () => {
        if (loading) {
            return (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#60a5fa" />
                </View>
            );
        }

        if (error) {
            return (
                <View style={styles.center}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            );
        }

        const dataMap = {
            chapters: { data: chapters, render: renderChapter, empty: '暂无章节' },
            assignments: { data: assignments, render: renderAssignment, empty: '暂无作业' },
            quizzes: { data: quizzes, render: renderQuiz, empty: '暂无测验' },
            resources: { data: resources, render: renderResource, empty: '暂无资源' },
        };

        const { data, render, empty } = dataMap[activeTab];

        return (
            <FlatList
                data={data as any[]}
                keyExtractor={(item) => (item.ID || item.id || Math.random()).toString()}
                renderItem={render as any}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>{empty}</Text>
                    </View>
                }
            />
        );
    };

    return (
        <View style={styles.container}>
            {/* Course Info */}
            <View style={styles.courseInfo}>
                <Text style={styles.courseDesc}>{course.description || '暂无课程描述'}</Text>
                <Text style={styles.teacherInfo}>👨‍🏫 {course.teacher_name || '未知教师'}</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabRow}>
                {TABS.map((tab) => (
                    <Pressable
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {/* Content */}
            {renderTabContent()}

            {/* FAB for teachers to add items */}
            {isTeacher && activeTab !== 'chapters' && (
                <Pressable
                    style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
                    onPress={() => {
                        const typeMap: Record<TabKey, 'assignment' | 'quiz' | 'resource'> = {
                            chapters: 'assignment',
                            assignments: 'assignment',
                            quizzes: 'quiz',
                            resources: 'resource',
                        };
                        setCreateType(typeMap[activeTab]);
                        setShowCreateModal(true);
                    }}
                >
                    <Text style={styles.fabText}>+</Text>
                </Pressable>
            )}

            {/* Create Item Modal */}
            <Modal
                visible={showCreateModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowCreateModal(false)}
            >
                <CreateItemScreen
                    session={session}
                    course={course}
                    itemType={createType}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => fetchData()}
                />
            </Modal>
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    courseInfo: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
    },
    courseDesc: {
        color: '#cbd5e1',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 8,
    },
    teacherInfo: {
        color: '#64748b',
        fontSize: 12,
    },
    tabRow: {
        flexDirection: 'row',
        backgroundColor: '#111827',
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    tabActive: {
        borderBottomWidth: 2,
        borderBottomColor: '#2563eb',
    },
    tabText: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '500',
    },
    tabTextActive: {
        color: '#60a5fa',
    },
    list: {
        padding: 16,
        gap: 10,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#334155',
    },
    listItemPressed: {
        opacity: 0.85,
    },
    itemIndex: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#2563eb',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    indexText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    itemContent: {
        flex: 1,
    },
    itemTitle: {
        color: '#f8fafc',
        fontSize: 15,
        fontWeight: '500',
        marginBottom: 2,
    },
    itemDesc: {
        color: '#64748b',
        fontSize: 12,
    },
    listArrow: {
        color: '#475569',
        fontSize: 20,
        marginLeft: 8,
    },
    studyTimeBadge: {
        backgroundColor: '#065f46',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        marginRight: 8,
    },
    studyTimeText: {
        color: '#6ee7b7',
        fontSize: 11,
        fontWeight: '600',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    successBadge: {
        backgroundColor: '#065f46',
    },
    warningBadge: {
        backgroundColor: '#92400e',
    },
    pendingBadge: {
        backgroundColor: '#374151',
    },
    statusText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
    downloadIcon: {
        fontSize: 18,
        marginLeft: 8,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        color: '#64748b',
        fontSize: 14,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 14,
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#2563eb',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 8,
    },
    fabPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.95 }],
    },
    fabText: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '400',
        lineHeight: 32,
    },
});
