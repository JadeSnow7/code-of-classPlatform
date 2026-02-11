import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
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
    WRITING_TYPE_LABELS,
    checkinAttendance,
    createAnnouncement,
    deleteAnnouncement,
    endAttendanceSession,
    getAnnouncements,
    getAssignments,
    getAttendanceRecords,
    getAttendanceSessions,
    getAttendanceSummary,
    getChapters,
    getCourseOverviewStats,
    getQuizzes,
    getResources,
    getWritingSubmissions,
    markAnnouncementRead,
    startAttendanceSession,
    submitWriting,
} from '../api';
import type {
    Announcement,
    Assignment,
    AttendanceRecord,
    AttendanceSession,
    AttendanceSummary,
    AuthSession,
    Chapter,
    CourseOverviewStats,
    Quiz,
    QuizWithAttempt,
    Resource,
    WritingSubmission,
    WritingType,
} from '../types';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import CreateItemScreen from './CreateItemScreen';
import { appStyles, palette, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'CourseDetail'> & {
    session: AuthSession;
};

type TabKey =
    | 'overview'
    | 'announcements'
    | 'chapters'
    | 'attendance'
    | 'writing'
    | 'assignments'
    | 'quizzes'
    | 'resources';

const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: '概览' },
    { key: 'announcements', label: '公告' },
    { key: 'chapters', label: '章节' },
    { key: 'attendance', label: '考勤' },
    { key: 'writing', label: '写作' },
    { key: 'assignments', label: '作业' },
    { key: 'quizzes', label: '测验' },
    { key: 'resources', label: '资料' },
];

const WRITING_TYPES: WritingType[] = ['course_paper', 'literature_review', 'thesis', 'abstract'];

function isQuizWithAttempt(item: Quiz | QuizWithAttempt): item is QuizWithAttempt {
    return 'attempt_count' in item;
}

function getQuizStatusLabel(quiz: Quiz | QuizWithAttempt): string {
    const now = Date.now();

    if (!quiz.is_published) {
        return '草稿';
    }

    if (quiz.start_time && new Date(quiz.start_time).getTime() > now) {
        return '未开始';
    }

    if (quiz.end_time && new Date(quiz.end_time).getTime() < now) {
        return '已结束';
    }

    return '进行中';
}

function getResourceDisplayName(resource: Resource): string {
    return resource.title || resource.name || '未命名资源';
}

function getAssignmentStatusLabel(assignment: Assignment): string {
    if (assignment.status === 'graded') {
        return '已批改';
    }
    if (assignment.status === 'submitted') {
        return '已提交';
    }
    if (assignment.status === 'pending') {
        return '待提交';
    }
    return '查看详情';
}

export default function CourseDetailScreen({ navigation, route, session }: Props) {
    const { course } = route.params;

    const isTeacher = session.user.role === 'teacher' || session.user.role === 'admin' || session.user.role === 'assistant';
    const canManageAnnouncements = isTeacher && Number(session.user.id) === course.teacher_id;

    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [overviewStats, setOverviewStats] = useState<CourseOverviewStats | null>(null);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [quizzes, setQuizzes] = useState<Array<Quiz | QuizWithAttempt>>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
    const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
    const [writingSubmissions, setWritingSubmissions] = useState<WritingSubmission[]>([]);

    const [selectedResourceType, setSelectedResourceType] = useState<string>('');

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createType, setCreateType] = useState<'assignment' | 'quiz' | 'resource'>('assignment');

    const [showAnnouncementComposer, setShowAnnouncementComposer] = useState(false);
    const [announcementTitle, setAnnouncementTitle] = useState('');
    const [announcementContent, setAnnouncementContent] = useState('');
    const [postingAnnouncement, setPostingAnnouncement] = useState(false);

    const [attendanceCode, setAttendanceCode] = useState('');
    const [attendanceTimeoutMinutes, setAttendanceTimeoutMinutes] = useState('15');
    const [selectedAttendanceSessionId, setSelectedAttendanceSessionId] = useState<number | null>(null);

    const [writingTitle, setWritingTitle] = useState('');
    const [writingContent, setWritingContent] = useState('');
    const [writingType, setWritingType] = useState<WritingType>('course_paper');
    const [writingSubmitting, setWritingSubmitting] = useState(false);

    const sortedAnnouncements = useMemo(() => {
        return [...announcements].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }, [announcements]);

    const filteredResources = useMemo(() => {
        if (!selectedResourceType) {
            return resources;
        }
        return resources.filter((item) => (item.type || '').toLowerCase() === selectedResourceType);
    }, [resources, selectedResourceType]);

    const loadAll = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError(null);

        try {
            const [
                overviewData,
                chapterData,
                assignmentData,
                quizData,
                resourceData,
                announcementData,
                attendanceSummaryData,
                attendanceSessionData,
                writingData,
            ] = await Promise.all([
                getCourseOverviewStats(session.token, session.tokenType, course.ID),
                getChapters(session.token, session.tokenType, course.ID),
                getAssignments(session.token, session.tokenType, course.ID),
                getQuizzes(session.token, session.tokenType, course.ID),
                getResources(session.token, session.tokenType, course.ID),
                getAnnouncements(session.token, session.tokenType, course.ID),
                getAttendanceSummary(session.token, session.tokenType, course.ID),
                getAttendanceSessions(session.token, session.tokenType, course.ID),
                getWritingSubmissions(session.token, session.tokenType, course.ID),
            ]);

            setOverviewStats(overviewData);
            setChapters(chapterData);
            setAssignments(assignmentData);
            setQuizzes(quizData);
            setResources(resourceData);
            setAnnouncements(announcementData);
            setAttendanceSummary(attendanceSummaryData);
            setAttendanceSessions(attendanceSessionData);
            setWritingSubmissions(writingData);

            if (attendanceSessionData.length > 0) {
                const currentSessionId = selectedAttendanceSessionId ?? attendanceSessionData[0].id;
                setSelectedAttendanceSessionId(currentSessionId);

                if (isTeacher) {
                    const records = await getAttendanceRecords(
                        session.token,
                        session.tokenType,
                        currentSessionId
                    );
                    setAttendanceRecords(records);
                }
            } else {
                setAttendanceRecords([]);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : '加载课程数据失败';
            setError(message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [
        course.ID,
        isTeacher,
        selectedAttendanceSessionId,
        session.token,
        session.tokenType,
    ]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const handleCreateSuccess = async () => {
        await loadAll(true);
    };

    const handleAnnouncementSubmit = async () => {
        if (!announcementTitle.trim() || !announcementContent.trim() || postingAnnouncement) {
            return;
        }

        setPostingAnnouncement(true);
        try {
            await createAnnouncement(session.token, session.tokenType, course.ID, {
                title: announcementTitle.trim(),
                content: announcementContent.trim(),
            });
            setAnnouncementTitle('');
            setAnnouncementContent('');
            setShowAnnouncementComposer(false);
            await loadAll(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : '发布公告失败';
            Alert.alert('发布失败', message);
        } finally {
            setPostingAnnouncement(false);
        }
    };

    const handleAnnouncementDelete = async (id: number) => {
        Alert.alert('删除公告', '确定删除这条公告吗？', [
            { text: '取消', style: 'cancel' },
            {
                text: '删除',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteAnnouncement(session.token, session.tokenType, id);
                        await loadAll(true);
                    } catch (err) {
                        const message = err instanceof Error ? err.message : '删除失败';
                        Alert.alert('删除失败', message);
                    }
                },
            },
        ]);
    };

    const handleAnnouncementRead = async (announcement: Announcement) => {
        if (announcement.is_read || canManageAnnouncements) {
            return;
        }

        try {
            await markAnnouncementRead(session.token, session.tokenType, announcement.id);
            setAnnouncements((prev) =>
                prev.map((item) => (item.id === announcement.id ? { ...item, is_read: true } : item))
            );
        } catch {
            // Ignore read errors to keep UX fluid.
        }
    };

    const handleOpenResource = async (resource: Resource) => {
        if (!resource.url) {
            Alert.alert('无法打开', '该资源没有可用链接。');
            return;
        }

        try {
            const supported = await Linking.canOpenURL(resource.url);
            if (!supported) {
                Alert.alert('无法打开', '当前设备不支持此链接。');
                return;
            }
            await Linking.openURL(resource.url);
        } catch {
            Alert.alert('打开失败', '请稍后重试。');
        }
    };

    const handleStartAttendance = async () => {
        const timeout = Number(attendanceTimeoutMinutes);
        if (!Number.isFinite(timeout) || timeout <= 0) {
            Alert.alert('参数错误', '请输入有效的签到时长（分钟）。');
            return;
        }

        try {
            await startAttendanceSession(session.token, session.tokenType, course.ID, timeout);
            await loadAll(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : '发起签到失败';
            Alert.alert('发起失败', message);
        }
    };

    const handleEndAttendance = async (sessionId: number) => {
        try {
            await endAttendanceSession(session.token, session.tokenType, sessionId);
            await loadAll(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : '结束签到失败';
            Alert.alert('结束失败', message);
        }
    };

    const handleStudentCheckin = async () => {
        const activeSessionId = attendanceSummary?.active_session?.id;
        if (!activeSessionId) {
            Alert.alert('当前不可签到', '教师尚未发起签到。');
            return;
        }

        if (!attendanceCode.trim()) {
            Alert.alert('请输入签到码', '签到码不能为空。');
            return;
        }

        try {
            await checkinAttendance(session.token, session.tokenType, activeSessionId, attendanceCode.trim());
            setAttendanceCode('');
            Alert.alert('签到成功', '本次签到已记录。');
            await loadAll(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : '签到失败';
            Alert.alert('签到失败', message);
        }
    };

    const handleWritingSubmit = async () => {
        const trimmedTitle = writingTitle.trim();
        const trimmedContent = writingContent.trim();
        const wordCount = trimmedContent.split(/\s+/).filter(Boolean).length;

        if (!trimmedTitle) {
            Alert.alert('标题为空', '请输入写作标题。');
            return;
        }

        if (wordCount < 50) {
            Alert.alert('内容过短', '写作内容至少 50 个词。');
            return;
        }

        setWritingSubmitting(true);
        try {
            await submitWriting(session.token, session.tokenType, course.ID, {
                title: trimmedTitle,
                content: trimmedContent,
                writing_type: writingType,
            });

            setWritingTitle('');
            setWritingContent('');
            Alert.alert('提交成功', '写作已提交，AI 分析完成后可查看详情。');
            await loadAll(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : '提交写作失败';
            Alert.alert('提交失败', message);
        } finally {
            setWritingSubmitting(false);
        }
    };

    const handleLoadAttendanceRecords = async (sessionId: number) => {
        setSelectedAttendanceSessionId(sessionId);

        if (!isTeacher) {
            return;
        }

        try {
            const records = await getAttendanceRecords(session.token, session.tokenType, sessionId);
            setAttendanceRecords(records);
        } catch {
            setAttendanceRecords([]);
        }
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={palette.primary} />
                <Text style={styles.centerText}>加载课程内容中...</Text>
            </View>
        );
    }

    if (error && !overviewStats) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={() => void loadAll()}>
                    <Text style={styles.retryButtonText}>重试</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={appStyles.page}>
            <ScrollView
                contentContainerStyle={styles.pageContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => void loadAll(true)}
                        tintColor={palette.primary}
                    />
                }
            >
                <View style={styles.heroCard}>
                    <Text style={styles.courseName}>{course.name}</Text>
                    <Text style={styles.courseDescription}>{course.description || '暂无课程介绍'}</Text>
                    <View style={styles.courseMetaRow}>
                        <Text style={styles.courseMeta}>教师 ID: {course.teacher_id}</Text>
                        <Text style={styles.courseMeta}>人数: {course.student_count ?? 0}</Text>
                    </View>
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabRow}
                >
                    {TABS.map((tab) => {
                        const isActive = tab.key === activeTab;
                        return (
                            <Pressable
                                key={tab.key}
                                onPress={() => setActiveTab(tab.key)}
                                style={({ pressed }) => [
                                    styles.tabChip,
                                    isActive ? styles.tabChipActive : styles.tabChipIdle,
                                    pressed && styles.tabChipPressed,
                                ]}
                            >
                                <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                                    {tab.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {activeTab === 'overview' ? (
                    <View style={styles.sectionColumn}>
                        <Text style={appStyles.sectionTitle}>课程总览</Text>
                        <View style={styles.statsGrid}>
                            <StatCard label="未读公告" value={`${overviewStats?.unreadAnnouncements ?? 0}`} />
                            <StatCard label="待处理作业" value={`${overviewStats?.pendingAssignments ?? 0}`} />
                            <StatCard label="出勤率" value={`${overviewStats?.attendanceRate ?? 0}%`} />
                        </View>
                    </View>
                ) : null}

                {activeTab === 'announcements' ? (
                    <View style={styles.sectionColumn}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={appStyles.sectionTitle}>课程公告</Text>
                            {canManageAnnouncements ? (
                                <Pressable
                                    style={styles.inlineActionButton}
                                    onPress={() => setShowAnnouncementComposer((prev) => !prev)}
                                >
                                    <Text style={styles.inlineActionButtonText}>
                                        {showAnnouncementComposer ? '收起' : '发布'}
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>

                        {showAnnouncementComposer ? (
                            <View style={styles.editorCard}>
                                <TextInput
                                    style={styles.editorTitleInput}
                                    value={announcementTitle}
                                    onChangeText={setAnnouncementTitle}
                                    placeholder="公告标题"
                                    placeholderTextColor={palette.textMuted}
                                />
                                <TextInput
                                    style={styles.editorContentInput}
                                    value={announcementContent}
                                    onChangeText={setAnnouncementContent}
                                    placeholder="公告内容"
                                    placeholderTextColor={palette.textMuted}
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                />
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.submitInlineButton,
                                        postingAnnouncement && styles.submitInlineButtonDisabled,
                                        pressed && !postingAnnouncement && styles.submitInlineButtonPressed,
                                    ]}
                                    onPress={() => void handleAnnouncementSubmit()}
                                    disabled={postingAnnouncement}
                                >
                                    {postingAnnouncement ? (
                                        <ActivityIndicator size="small" color={palette.textPrimary} />
                                    ) : (
                                        <Text style={styles.submitInlineButtonText}>发布公告</Text>
                                    )}
                                </Pressable>
                            </View>
                        ) : null}

                        {sortedAnnouncements.length === 0 ? (
                            <EmptyCard message="暂无公告" />
                        ) : (
                            <View style={styles.listColumn}>
                                {sortedAnnouncements.map((item) => (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => void handleAnnouncementRead(item)}
                                        style={({ pressed }) => [
                                            styles.listCard,
                                            !item.is_read && styles.unreadCard,
                                            pressed && styles.cardPressed,
                                        ]}
                                    >
                                        <View style={styles.listCardHeader}>
                                            <Text style={styles.listCardTitle}>{item.title}</Text>
                                            {canManageAnnouncements ? (
                                                <Pressable
                                                    onPress={() => void handleAnnouncementDelete(item.id)}
                                                    style={styles.deleteButton}
                                                >
                                                    <Text style={styles.deleteButtonText}>删除</Text>
                                                </Pressable>
                                            ) : null}
                                        </View>
                                        <Text style={styles.listCardDesc}>{item.content}</Text>
                                        <Text style={styles.listCardMeta}>
                                            {new Date(item.created_at).toLocaleString('zh-CN')}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                ) : null}

                {activeTab === 'chapters' ? (
                    <View style={styles.sectionColumn}>
                        <Text style={appStyles.sectionTitle}>章节学习</Text>
                        {chapters.length === 0 ? (
                            <EmptyCard message="暂无章节" />
                        ) : (
                            <View style={styles.listColumn}>
                                {chapters.map((chapter, index) => (
                                    <Pressable
                                        key={chapter.ID}
                                        style={({ pressed }) => [styles.listCard, pressed && styles.cardPressed]}
                                        onPress={() =>
                                            navigation.navigate('ChapterContent', {
                                                chapterId: chapter.ID,
                                                title: chapter.title,
                                            })
                                        }
                                    >
                                        <View style={styles.indexBadge}>
                                            <Text style={styles.indexBadgeText}>{index + 1}</Text>
                                        </View>
                                        <View style={styles.flexOne}>
                                            <Text style={styles.listCardTitle}>{chapter.title}</Text>
                                            <Text style={styles.listCardDesc}>{chapter.description || '暂无描述'}</Text>
                                        </View>
                                        <Text style={styles.chevron}>›</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                ) : null}

                {activeTab === 'attendance' ? (
                    <View style={styles.sectionColumn}>
                        <Text style={appStyles.sectionTitle}>课程考勤</Text>
                        {isTeacher ? (
                            <View style={styles.listColumn}>
                                <View style={styles.attendanceControlCard}>
                                    {attendanceSummary?.active_session ? (
                                        <>
                                            <Text style={styles.liveSessionCode}>{attendanceSummary.active_session.code}</Text>
                                            <Text style={styles.liveSessionHint}>
                                                结束时间 {new Date(attendanceSummary.active_session.ends_at).toLocaleTimeString('zh-CN')}
                                            </Text>
                                            <Pressable
                                                style={styles.dangerButton}
                                                onPress={() => void handleEndAttendance(attendanceSummary.active_session!.id)}
                                            >
                                                <Text style={styles.dangerButtonText}>结束签到</Text>
                                            </Pressable>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.liveSessionHint}>当前没有进行中的签到</Text>
                                            <View style={styles.attendanceStartRow}>
                                                <TextInput
                                                    value={attendanceTimeoutMinutes}
                                                    onChangeText={setAttendanceTimeoutMinutes}
                                                    keyboardType="number-pad"
                                                    style={styles.timeoutInput}
                                                    placeholder="分钟"
                                                    placeholderTextColor={palette.textMuted}
                                                />
                                                <Pressable style={styles.primarySmallButton} onPress={() => void handleStartAttendance()}>
                                                    <Text style={styles.primarySmallButtonText}>发起签到</Text>
                                                </Pressable>
                                            </View>
                                        </>
                                    )}
                                </View>

                                <View style={styles.attendancePanelRow}>
                                    <View style={styles.sessionListCard}>
                                        <Text style={styles.sessionListTitle}>历史场次</Text>
                                        {attendanceSessions.length === 0 ? (
                                            <Text style={styles.emptyInlineText}>暂无历史记录</Text>
                                        ) : (
                                            attendanceSessions.map((item) => (
                                                <Pressable
                                                    key={item.id}
                                                    onPress={() => void handleLoadAttendanceRecords(item.id)}
                                                    style={[
                                                        styles.sessionListItem,
                                                        selectedAttendanceSessionId === item.id && styles.sessionListItemActive,
                                                    ]}
                                                >
                                                    <Text style={styles.sessionListItemDate}>
                                                        {new Date(item.start_at).toLocaleString('zh-CN')}
                                                    </Text>
                                                    <Text style={styles.sessionListItemCount}>{item.attendee_count} 人</Text>
                                                </Pressable>
                                            ))
                                        )}
                                    </View>

                                    <View style={styles.sessionRecordCard}>
                                        <Text style={styles.sessionListTitle}>签到记录</Text>
                                        {attendanceRecords.length === 0 ? (
                                            <Text style={styles.emptyInlineText}>暂无签到记录</Text>
                                        ) : (
                                            attendanceRecords.map((record) => (
                                                <View key={`${record.student_id}-${record.checked_in_at}`} style={styles.recordRow}>
                                                    <Text style={styles.recordName}>{record.student_name}</Text>
                                                    <Text style={styles.recordMeta}>
                                                        {new Date(record.checked_in_at).toLocaleTimeString('zh-CN')}
                                                    </Text>
                                                </View>
                                            ))
                                        )}
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.attendanceControlCard}>
                                {attendanceSummary?.active_session ? (
                                    <>
                                        <Text style={styles.liveSessionHint}>请输入教师公布的签到码</Text>
                                        <TextInput
                                            value={attendanceCode}
                                            onChangeText={setAttendanceCode}
                                            maxLength={6}
                                            keyboardType="number-pad"
                                            style={styles.attendanceCodeInput}
                                            placeholder="000000"
                                            placeholderTextColor={palette.textMuted}
                                        />
                                        <Pressable style={styles.primaryBigButton} onPress={() => void handleStudentCheckin()}>
                                            <Text style={styles.primaryBigButtonText}>立即签到</Text>
                                        </Pressable>
                                    </>
                                ) : (
                                    <Text style={styles.liveSessionHint}>当前没有正在进行的签到</Text>
                                )}
                                <View style={styles.attendanceRateBox}>
                                    <Text style={styles.attendanceRateLabel}>累计出勤率</Text>
                                    <Text style={styles.attendanceRateValue}>
                                        {Math.round((attendanceSummary?.attendance_rate ?? 0) * 100)}%
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                ) : null}

                {activeTab === 'writing' ? (
                    <View style={styles.sectionColumn}>
                        <Text style={appStyles.sectionTitle}>学术写作</Text>

                        <View style={styles.editorCard}>
                            <TextInput
                                value={writingTitle}
                                onChangeText={setWritingTitle}
                                placeholder="写作标题"
                                placeholderTextColor={palette.textMuted}
                                style={styles.editorTitleInput}
                            />

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.writingTypeRow}>
                                {WRITING_TYPES.map((type) => (
                                    <Pressable
                                        key={type}
                                        onPress={() => setWritingType(type)}
                                        style={[
                                            styles.writingTypeChip,
                                            writingType === type && styles.writingTypeChipActive,
                                        ]}
                                    >
                                        <Text style={[
                                            styles.writingTypeChipText,
                                            writingType === type && styles.writingTypeChipTextActive,
                                        ]}>
                                            {WRITING_TYPE_LABELS[type]}
                                        </Text>
                                    </Pressable>
                                ))}
                            </ScrollView>

                            <TextInput
                                value={writingContent}
                                onChangeText={setWritingContent}
                                placeholder="输入或粘贴英文写作内容（至少 50 词）"
                                placeholderTextColor={palette.textMuted}
                                style={styles.editorContentInput}
                                multiline
                                numberOfLines={7}
                                textAlignVertical="top"
                            />

                            <Pressable
                                style={({ pressed }) => [
                                    styles.submitInlineButton,
                                    writingSubmitting && styles.submitInlineButtonDisabled,
                                    pressed && !writingSubmitting && styles.submitInlineButtonPressed,
                                ]}
                                onPress={() => void handleWritingSubmit()}
                                disabled={writingSubmitting}
                            >
                                {writingSubmitting ? (
                                    <ActivityIndicator size="small" color={palette.textPrimary} />
                                ) : (
                                    <Text style={styles.submitInlineButtonText}>提交分析</Text>
                                )}
                            </Pressable>
                        </View>

                        <Text style={styles.subSectionLabel}>历史记录</Text>
                        {writingSubmissions.length === 0 ? (
                            <EmptyCard message="暂无写作提交记录" />
                        ) : (
                            <View style={styles.listColumn}>
                                {writingSubmissions.map((submission) => (
                                    <Pressable
                                        key={submission.id}
                                        style={({ pressed }) => [styles.listCard, pressed && styles.cardPressed]}
                                        onPress={() =>
                                            navigation.navigate('WritingDetail', {
                                                submissionId: submission.id,
                                                courseId: course.ID,
                                                title: submission.title,
                                            })
                                        }
                                    >
                                        <Text style={styles.listCardTitle}>{submission.title}</Text>
                                        <Text style={styles.listCardDesc}>
                                            {WRITING_TYPE_LABELS[submission.writing_type]} · {submission.word_count} 词
                                        </Text>
                                        <Text style={styles.listCardMeta}>
                                            {new Date(submission.created_at).toLocaleDateString('zh-CN')}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                ) : null}

                {activeTab === 'assignments' ? (
                    <View style={styles.sectionColumn}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={appStyles.sectionTitle}>课程作业</Text>
                            {isTeacher ? (
                                <Pressable
                                    style={styles.inlineActionButton}
                                    onPress={() => {
                                        setCreateType('assignment');
                                        setShowCreateModal(true);
                                    }}
                                >
                                    <Text style={styles.inlineActionButtonText}>发布作业</Text>
                                </Pressable>
                            ) : null}
                        </View>

                        {assignments.length === 0 ? (
                            <EmptyCard message="暂无作业" />
                        ) : (
                            <View style={styles.listColumn}>
                                {assignments.map((assignment) => (
                                    <Pressable
                                        key={assignment.ID}
                                        style={({ pressed }) => [styles.listCard, pressed && styles.cardPressed]}
                                        onPress={() =>
                                            navigation.navigate('AssignmentDetail', {
                                                assignmentId: assignment.ID,
                                                courseId: course.ID,
                                                title: assignment.title,
                                            })
                                        }
                                    >
                                        <View style={styles.listCardHeader}>
                                            <Text style={styles.listCardTitle}>{assignment.title}</Text>
                                            <Text style={styles.statusText}>{getAssignmentStatusLabel(assignment)}</Text>
                                        </View>
                                        <Text style={styles.listCardDesc}>{assignment.description || '暂无描述'}</Text>
                                        <Text style={styles.listCardMeta}>
                                            截止 {assignment.deadline ? new Date(assignment.deadline).toLocaleString('zh-CN') : '未设置'}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                ) : null}

                {activeTab === 'quizzes' ? (
                    <View style={styles.sectionColumn}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={appStyles.sectionTitle}>在线测验</Text>
                            {isTeacher ? (
                                <Pressable
                                    style={styles.inlineActionButton}
                                    onPress={() => {
                                        setCreateType('quiz');
                                        setShowCreateModal(true);
                                    }}
                                >
                                    <Text style={styles.inlineActionButtonText}>创建测验</Text>
                                </Pressable>
                            ) : null}
                        </View>

                        {quizzes.length === 0 ? (
                            <EmptyCard message="暂无测验" />
                        ) : (
                            <View style={styles.listColumn}>
                                {quizzes.map((quiz) => (
                                    <Pressable
                                        key={quiz.ID}
                                        style={({ pressed }) => [styles.listCard, pressed && styles.cardPressed]}
                                        onPress={() =>
                                            navigation.navigate('QuizDetail', {
                                                quizId: quiz.ID,
                                                courseId: course.ID,
                                                title: quiz.title,
                                            })
                                        }
                                    >
                                        <View style={styles.listCardHeader}>
                                            <Text style={styles.listCardTitle}>{quiz.title}</Text>
                                            <Text style={styles.statusText}>{getQuizStatusLabel(quiz)}</Text>
                                        </View>
                                        <Text style={styles.listCardDesc}>{quiz.description || '暂无描述'}</Text>
                                        <Text style={styles.listCardMeta}>
                                            {(quiz.time_limit ?? 0) > 0 ? `${quiz.time_limit} 分钟` : '无时限'} · 总分 {quiz.total_points ?? 0}
                                        </Text>
                                        {isQuizWithAttempt(quiz) ? (
                                            <Text style={styles.listCardMeta}>
                                                已尝试 {quiz.attempt_count}/{quiz.max_attempts ?? 0}
                                                {quiz.best_score !== null ? ` · 最高 ${quiz.best_score}` : ''}
                                            </Text>
                                        ) : null}
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                ) : null}

                {activeTab === 'resources' ? (
                    <View style={styles.sectionColumn}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={appStyles.sectionTitle}>课程资料</Text>
                            {isTeacher ? (
                                <Pressable
                                    style={styles.inlineActionButton}
                                    onPress={() => {
                                        setCreateType('resource');
                                        setShowCreateModal(true);
                                    }}
                                >
                                    <Text style={styles.inlineActionButtonText}>添加资料</Text>
                                </Pressable>
                            ) : null}
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resourceFilterRow}>
                            {[
                                { key: '', label: '全部' },
                                { key: 'video', label: '视频' },
                                { key: 'paper', label: '论文' },
                                { key: 'link', label: '链接' },
                            ].map((item) => (
                                <Pressable
                                    key={item.key}
                                    onPress={() => setSelectedResourceType(item.key)}
                                    style={[
                                        styles.resourceFilterChip,
                                        selectedResourceType === item.key && styles.resourceFilterChipActive,
                                    ]}
                                >
                                    <Text style={[
                                        styles.resourceFilterChipText,
                                        selectedResourceType === item.key && styles.resourceFilterChipTextActive,
                                    ]}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>

                        {filteredResources.length === 0 ? (
                            <EmptyCard message="暂无资料" />
                        ) : (
                            <View style={styles.listColumn}>
                                {filteredResources.map((resource) => (
                                    <Pressable
                                        key={resource.ID}
                                        style={({ pressed }) => [styles.listCard, pressed && styles.cardPressed]}
                                        onPress={() => void handleOpenResource(resource)}
                                    >
                                        <View style={styles.listCardHeader}>
                                            <Text style={styles.listCardTitle}>{getResourceDisplayName(resource)}</Text>
                                            <Text style={styles.statusText}>{(resource.type || 'link').toUpperCase()}</Text>
                                        </View>
                                        <Text style={styles.listCardDesc}>{resource.description || resource.url || '暂无描述'}</Text>
                                        <Text style={styles.listCardMeta}>点击打开资源链接</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                ) : null}
            </ScrollView>

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
                    onSuccess={handleCreateSuccess}
                />
            </Modal>
        </View>
    );
}

function EmptyCard({ message }: { message: string }) {
    return (
        <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{message}</Text>
        </View>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.statCard}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
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
        borderRadius: radius.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
    },
    retryButtonText: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    heroCard: {
        ...appStyles.card,
        backgroundColor: palette.backgroundElevated,
        gap: spacing.sm,
    },
    courseName: {
        color: palette.textPrimary,
        fontSize: 24,
        fontWeight: '700',
    },
    courseDescription: {
        color: palette.textSecondary,
        fontSize: 14,
        lineHeight: 21,
    },
    courseMetaRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    courseMeta: {
        color: palette.textMuted,
        fontSize: 12,
    },
    tabRow: {
        gap: spacing.xs,
        paddingVertical: 2,
    },
    tabChip: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 8,
        borderRadius: radius.full,
        borderWidth: 1,
    },
    tabChipIdle: {
        backgroundColor: palette.backgroundMuted,
        borderColor: palette.border,
    },
    tabChipActive: {
        backgroundColor: palette.primary,
        borderColor: palette.primary,
    },
    tabChipPressed: {
        opacity: 0.85,
    },
    tabChipText: {
        color: palette.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    tabChipTextActive: {
        color: palette.textPrimary,
    },
    sectionColumn: {
        gap: spacing.sm,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    inlineActionButton: {
        backgroundColor: palette.primaryMuted,
        borderRadius: radius.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: 8,
    },
    inlineActionButtonText: {
        color: palette.textPrimary,
        fontSize: 12,
        fontWeight: '700',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    statCard: {
        ...appStyles.card,
        width: '48%',
        minHeight: 98,
        justifyContent: 'space-between',
        backgroundColor: '#0f1a2f',
    },
    statLabel: {
        color: palette.textMuted,
        fontSize: 12,
    },
    statValue: {
        color: palette.textPrimary,
        fontSize: 24,
        fontWeight: '800',
    },
    editorCard: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    editorTitleInput: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        fontSize: 14,
    },
    editorContentInput: {
        minHeight: 120,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        fontSize: 14,
        lineHeight: 21,
    },
    submitInlineButton: {
        minHeight: 42,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitInlineButtonDisabled: {
        opacity: 0.6,
    },
    submitInlineButtonPressed: {
        opacity: 0.85,
    },
    submitInlineButtonText: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    listColumn: {
        gap: spacing.sm,
    },
    listCard: {
        ...appStyles.card,
        gap: spacing.xs,
    },
    unreadCard: {
        borderColor: palette.primary,
    },
    cardPressed: {
        opacity: 0.86,
    },
    listCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.sm,
    },
    listCardTitle: {
        color: palette.textPrimary,
        fontSize: 15,
        fontWeight: '700',
        flex: 1,
    },
    deleteButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.sm,
        backgroundColor: '#7f1d1d',
    },
    deleteButtonText: {
        color: '#fecaca',
        fontSize: 11,
        fontWeight: '700',
    },
    listCardDesc: {
        color: palette.textSecondary,
        fontSize: 13,
        lineHeight: 20,
    },
    listCardMeta: {
        color: palette.textMuted,
        fontSize: 11,
    },
    indexBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.sm,
    },
    indexBadgeText: {
        color: palette.textPrimary,
        fontSize: 11,
        fontWeight: '700',
    },
    flexOne: {
        flex: 1,
    },
    chevron: {
        color: palette.textMuted,
        fontSize: 21,
    },
    attendanceControlCard: {
        ...appStyles.card,
        gap: spacing.sm,
    },
    liveSessionCode: {
        color: palette.accentCyan,
        fontSize: 38,
        fontWeight: '800',
        letterSpacing: 2,
    },
    liveSessionHint: {
        color: palette.textMuted,
        fontSize: 13,
    },
    dangerButton: {
        alignSelf: 'flex-start',
        backgroundColor: '#b91c1c',
        borderRadius: radius.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
    },
    dangerButtonText: {
        color: palette.textPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    attendanceStartRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'center',
    },
    timeoutInput: {
        width: 88,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
    },
    primarySmallButton: {
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    primarySmallButtonText: {
        color: palette.textPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    attendancePanelRow: {
        gap: spacing.sm,
    },
    sessionListCard: {
        ...appStyles.card,
        gap: spacing.xs,
    },
    sessionRecordCard: {
        ...appStyles.card,
        gap: spacing.xs,
    },
    sessionListTitle: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: spacing.xs,
    },
    sessionListItem: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        gap: 4,
    },
    sessionListItemActive: {
        borderColor: palette.primary,
        backgroundColor: '#1d4ed833',
    },
    sessionListItemDate: {
        color: palette.textSecondary,
        fontSize: 12,
    },
    sessionListItemCount: {
        color: palette.textMuted,
        fontSize: 11,
    },
    recordRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
        paddingVertical: spacing.xs,
    },
    recordName: {
        color: palette.textSecondary,
        fontSize: 13,
    },
    recordMeta: {
        color: palette.textMuted,
        fontSize: 11,
    },
    attendanceCodeInput: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.borderStrong,
        backgroundColor: palette.background,
        color: palette.textPrimary,
        fontSize: 26,
        letterSpacing: 8,
        textAlign: 'center',
        paddingVertical: spacing.sm,
    },
    primaryBigButton: {
        minHeight: 44,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBigButtonText: {
        color: palette.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    attendanceRateBox: {
        marginTop: spacing.xs,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    attendanceRateLabel: {
        color: palette.textMuted,
        fontSize: 12,
    },
    attendanceRateValue: {
        color: palette.accentCyan,
        fontSize: 22,
        fontWeight: '800',
    },
    subSectionLabel: {
        color: palette.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        marginTop: spacing.xs,
    },
    writingTypeRow: {
        gap: spacing.xs,
    },
    writingTypeChip: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 8,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
    },
    writingTypeChipActive: {
        borderColor: palette.primary,
        backgroundColor: '#1d4ed833',
    },
    writingTypeChipText: {
        color: palette.textSecondary,
        fontSize: 12,
    },
    writingTypeChipTextActive: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    errorInlineText: {
        color: palette.danger,
        fontSize: 12,
    },
    emptyInlineText: {
        color: palette.textMuted,
        fontSize: 12,
    },
    statusText: {
        color: palette.accentCyan,
        fontSize: 11,
        fontWeight: '700',
    },
    resourceFilterRow: {
        gap: spacing.xs,
    },
    resourceFilterChip: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 8,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
    },
    resourceFilterChipActive: {
        borderColor: palette.primary,
        backgroundColor: '#1d4ed833',
    },
    resourceFilterChipText: {
        color: palette.textSecondary,
        fontSize: 12,
    },
    resourceFilterChipTextActive: {
        color: palette.textPrimary,
        fontWeight: '700',
    },
    emptyCard: {
        ...appStyles.card,
        minHeight: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: palette.textMuted,
        fontSize: 14,
    },
});
