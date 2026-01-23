import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import {
    createAssignment,
    createQuiz,
    createResource,
    type CreateAssignmentRequest,
    type CreateQuizRequest,
    type CreateResourceRequest,
} from '../api';
import type { AuthSession, Course } from '../types';

type CreateItemScreenProps = {
    session: AuthSession;
    course: Course;
    itemType: 'assignment' | 'quiz' | 'resource';
    onClose: () => void;
    onSuccess: () => void;
};

const TYPE_CONFIG = {
    assignment: { title: '新建作业', icon: '📝' },
    quiz: { title: '新建测验', icon: '📋' },
    resource: { title: '新建资源', icon: '📚' },
};

const RESOURCE_TYPES = ['video', 'paper', 'link'] as const;

export default function CreateItemScreen({
    session,
    course,
    itemType,
    onClose,
    onSuccess,
}: CreateItemScreenProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [timeLimit, setTimeLimit] = useState('');
    const [resourceType, setResourceType] = useState<'video' | 'paper' | 'link'>('link');
    const [resourceUrl, setResourceUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const config = TYPE_CONFIG[itemType];
    const canSubmit = title.trim().length > 0 && !loading &&
        (itemType !== 'resource' || resourceUrl.trim().length > 0);

    const handleSubmit = async () => {
        if (!canSubmit) return;

        setError(null);
        setLoading(true);

        try {
            if (itemType === 'assignment') {
                const data: CreateAssignmentRequest = {
                    course_id: course.ID,
                    title: title.trim(),
                    description: description.trim() || undefined,
                    deadline: deadline.trim() || undefined,
                };
                await createAssignment(session.token, session.tokenType, data);
            } else if (itemType === 'quiz') {
                const data: CreateQuizRequest = {
                    course_id: course.ID,
                    title: title.trim(),
                    description: description.trim() || undefined,
                    time_limit: timeLimit ? parseInt(timeLimit, 10) : undefined,
                };
                await createQuiz(session.token, session.tokenType, data);
            } else {
                const data: CreateResourceRequest = {
                    course_id: course.ID,
                    title: title.trim(),
                    type: resourceType,
                    url: resourceUrl.trim(),
                    description: description.trim() || undefined,
                };
                await createResource(session.token, session.tokenType, data);
            }

            Alert.alert('成功', `${config.title.replace('新建', '')}创建成功！`, [
                { text: '确定', onPress: () => { onSuccess(); onClose(); } },
            ]);
        } catch (err) {
            setError(err instanceof Error ? err.message : '创建失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeBtnText}>取消</Text>
                </Pressable>
                <Text style={styles.headerTitle}>{config.icon} {config.title}</Text>
                <Pressable
                    style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.submitBtnText}>提交</Text>
                    )}
                </Pressable>
            </View>

            {/* Form */}
            <KeyboardAvoidingView
                style={styles.formContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                    {error && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Title */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>标题 *</Text>
                        <TextInput
                            style={styles.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholder={`请输入${config.title.replace('新建', '')}标题`}
                            placeholderTextColor="#64748b"
                            editable={!loading}
                        />
                    </View>

                    {/* Description */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>描述</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="请输入描述（可选）"
                            placeholderTextColor="#64748b"
                            multiline
                            numberOfLines={4}
                            editable={!loading}
                        />
                    </View>

                    {/* Assignment-specific: Deadline */}
                    {itemType === 'assignment' && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>截止日期</Text>
                            <TextInput
                                style={styles.input}
                                value={deadline}
                                onChangeText={setDeadline}
                                placeholder="格式：2026-01-20T23:59:00Z"
                                placeholderTextColor="#64748b"
                                editable={!loading}
                            />
                        </View>
                    )}

                    {/* Quiz-specific: Time Limit */}
                    {itemType === 'quiz' && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>时间限制（分钟）</Text>
                            <TextInput
                                style={styles.input}
                                value={timeLimit}
                                onChangeText={setTimeLimit}
                                placeholder="例如：30"
                                placeholderTextColor="#64748b"
                                keyboardType="number-pad"
                                editable={!loading}
                            />
                        </View>
                    )}

                    {/* Resource-specific: Type & URL */}
                    {itemType === 'resource' && (
                        <>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>资源类型 *</Text>
                                <View style={styles.typeRow}>
                                    {RESOURCE_TYPES.map((type) => (
                                        <Pressable
                                            key={type}
                                            style={[
                                                styles.typeBtn,
                                                resourceType === type && styles.typeBtnActive,
                                            ]}
                                            onPress={() => setResourceType(type)}
                                        >
                                            <Text
                                                style={[
                                                    styles.typeBtnText,
                                                    resourceType === type && styles.typeBtnTextActive,
                                                ]}
                                            >
                                                {type === 'video' ? '📹 视频' : type === 'paper' ? '📄 文档' : '🔗 链接'}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>资源链接 *</Text>
                                <TextInput
                                    style={styles.input}
                                    value={resourceUrl}
                                    onChangeText={setResourceUrl}
                                    placeholder="https://..."
                                    placeholderTextColor="#64748b"
                                    autoCapitalize="none"
                                    keyboardType="url"
                                    editable={!loading}
                                />
                            </View>
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0b1220',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
    },
    closeBtn: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    closeBtnText: {
        color: '#94a3b8',
        fontSize: 15,
    },
    headerTitle: {
        color: '#f8fafc',
        fontSize: 17,
        fontWeight: '600',
    },
    submitBtn: {
        backgroundColor: '#2563eb',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    submitBtnDisabled: {
        backgroundColor: '#1e40af',
        opacity: 0.5,
    },
    submitBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    formContainer: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    errorBanner: {
        backgroundColor: '#450a0a',
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 13,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#f8fafc',
        borderWidth: 1,
        borderColor: '#334155',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    typeRow: {
        flexDirection: 'row',
        gap: 10,
    },
    typeBtn: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        alignItems: 'center',
    },
    typeBtnActive: {
        backgroundColor: '#1d4ed8',
        borderColor: '#2563eb',
    },
    typeBtnText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '500',
    },
    typeBtnTextActive: {
        color: '#fff',
    },
});
