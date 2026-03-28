import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Clock, Trophy } from 'lucide-react';
import { quizApi, type QuizSummary } from '@/api/quiz';
import { authStore } from '@/lib/auth-store';
import { List, Typography, Button, Spin, Alert, Modal, Form, Input, InputNumber, Space, Tag, Card } from 'antd';

const { Title, Text, Paragraph } = Typography;

export function QuizzesPage() {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();
    const [showCreate, setShowCreate] = useState(false);
    const numericCourseId = Number(courseId);

    const user = authStore.getUser();
    const isTeacher = user?.role === 'admin' || user?.role === 'teacher' || user?.role === 'assistant';

    const quizzesQuery = useQuery({
        queryKey: ['course-quizzes', numericCourseId],
        enabled: Number.isFinite(numericCourseId),
        queryFn: async () => {
            const payload = await quizApi.listCourseQuizzes(numericCourseId);
            return payload.items;
        },
    });

    const createQuizMutation = useMutation({
        mutationFn: (values: { title: string; description: string; timeLimit: number }) => {
            if (!Number.isFinite(numericCourseId)) {
                throw new Error('courseId is required');
            }

            return quizApi.createQuiz({
                courseId: numericCourseId,
                title: values.title,
                description: values.description,
                durationMinutes: values.timeLimit || 0,
                maxAttempts: 1,
            });
        },
        onSuccess: (quiz) => {
            setShowCreate(false);
            navigate(`/courses/${courseId}/quizzes/${quiz.id}`);
        },
    });

    const quizzes = useMemo(() => quizzesQuery.data ?? [], [quizzesQuery.data]);

    const handleCreate = async (values: { title: string; description: string; timeLimit: number }) => {
        try {
            await createQuizMutation.mutateAsync(values);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '创建失败';
            alert('创建失败: ' + message);
        }
    };

    const getQuizStatus = (quiz: QuizSummary) => {
        const now = new Date();
        if (!quiz.isPublished) {
            return { label: '草稿', color: 'default' };
        }
        if (quiz.startTime && new Date(quiz.startTime) > now) {
            return { label: '未开始', color: 'warning' };
        }
        if (quiz.endTime && new Date(quiz.endTime) < now) {
            return { label: '已结束', color: 'error' };
        }
        return { label: '进行中', color: 'success' };
    };

    if (quizzesQuery.isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Spin size="large" />
            </div>
        );
    }

    if (quizzesQuery.isError) {
        const message = quizzesQuery.error instanceof Error ? quizzesQuery.error.message : 'Failed to load quizzes';
        return (
            <div className="p-6">
                <Alert message={message} type="error" showIcon />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <Space size="middle">
                    <div style={{ background: 'rgba(167, 139, 250, 0.2)', padding: 8, borderRadius: 8 }}>
                        <ClipboardList className="w-6 h-6 text-purple-400" />
                    </div>
                    <Title level={3} style={{ color: '#F8FAFC', margin: 0 }}>在线测验</Title>
                </Space>
                {isTeacher && (
                    <Button
                        type="primary"
                        icon={<Plus size={16} />}
                        onClick={() => setShowCreate(true)}
                        style={{ backgroundColor: '#9333EA', borderColor: '#9333EA' }}
                    >
                        创建测验
                    </Button>
                )}
            </div>

            <List
                grid={{ gutter: 16, xs: 1, sm: 2, md: 2, lg: 3, xl: 3, xxl: 4 }}
                dataSource={quizzes}
                locale={{
                    emptyText: (
                        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
                            <ClipboardList className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <Text style={{ color: '#94A3B8' }}>暂无测验</Text>
                        </div>
                    ),
                }}
                renderItem={(quiz) => {
                    const status = getQuizStatus(quiz);

                    return (
                        <List.Item>
                            <Link to={`/courses/${courseId}/quizzes/${quiz.id}`}>
                                <Card
                                    hoverable
                                    style={{
                                        background: 'rgba(31, 41, 55, 0.5)',
                                        border: '1px solid #374151',
                                        borderRadius: 12,
                                        height: '100%',
                                    }}
                                    bodyStyle={{ padding: 20 }}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <Title level={5} style={{ color: '#F8FAFC', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            {quiz.title}
                                        </Title>
                                        <Tag color={status.color} style={{ margin: 0, marginLeft: 8 }}>
                                            {status.label}
                                        </Tag>
                                    </div>

                                    <Paragraph
                                        style={{ color: '#94A3B8', fontSize: 13, minHeight: 40 }}
                                        ellipsis={{ rows: 2 }}
                                    >
                                        {quiz.description || '暂无描述'}
                                    </Paragraph>

                                    <Space size="large" style={{ color: '#6B7280', fontSize: 13 }}>
                                        {(quiz.durationMinutes ?? 0) > 0 && (
                                            <Space size="small">
                                                <Clock size={16} />
                                                <span>{quiz.durationMinutes}分钟</span>
                                            </Space>
                                        )}
                                        <Space size="small">
                                            <Trophy size={16} />
                                            <span>{quiz.totalPoints ?? 0}分</span>
                                        </Space>
                                    </Space>

                                    {typeof quiz.attemptCount === 'number' && (
                                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text style={{ color: '#94A3B8', fontSize: 12 }}>
                                                已尝试 {quiz.attemptCount}/{quiz.maxAttempts ?? 1} 次
                                            </Text>
                                            {quiz.bestScore !== null && quiz.bestScore !== undefined && (
                                                <Text style={{ color: '#4ADE80', fontSize: 12 }}>
                                                    最高分: {quiz.bestScore}
                                                </Text>
                                            )}
                                        </div>
                                    )}
                                </Card>
                            </Link>
                        </List.Item>
                    );
                }}
            />

            <Modal
                title="创建测验"
                open={showCreate}
                onCancel={() => setShowCreate(false)}
                footer={null}
            >
                <Form layout="vertical" onFinish={handleCreate} initialValues={{ timeLimit: 30 }} style={{ marginTop: 16 }}>
                    <Form.Item
                        name="title"
                        label="标题"
                        rules={[{ required: true, message: '请填写测验标题' }]}
                    >
                        <Input placeholder="输入测验标题" size="large" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea placeholder="输入测验描述" rows={3} />
                    </Form.Item>
                    <Form.Item name="timeLimit" label="时间限制（分钟）" extra="0 = 无限制">
                        <InputNumber min={0} style={{ width: '100%' }} size="large" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setShowCreate(false)}>取消</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={createQuizMutation.isPending}
                                style={{ backgroundColor: '#9333EA', borderColor: '#9333EA' }}
                            >
                                创建
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
