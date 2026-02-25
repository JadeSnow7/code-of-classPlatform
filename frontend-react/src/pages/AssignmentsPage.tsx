import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Plus, Calendar, User, ChevronRight } from 'lucide-react';
import { assignmentApi, type Assignment } from '@/api/assignment';
import { authStore } from '@/lib/auth-store';
import { List, Typography, Button, Spin, Alert, Modal, Form, Input, Space, message } from 'antd';

const { Title, Text, Paragraph } = Typography;

export function AssignmentsPage() {
    const { courseId } = useParams<{ courseId: string }>();
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const user = authStore.getUser();
    const canCreate = user?.role === 'admin' || user?.role === 'teacher';

    const loadAssignments = useCallback(async () => {
        if (!courseId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await assignmentApi.listByCourse(parseInt(courseId));
            setAssignments(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to load assignments';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        if (!courseId) return;
        void loadAssignments();
    }, [courseId, loadAssignments]);

    const handleCreate = async (values: { title: string; description: string }) => {
        if (!courseId) return;
        try {
            await assignmentApi.create({
                course_id: parseInt(courseId),
                ...values,
            });
            setShowCreate(false);
            message.success('作业发布成功');
            loadAssignments();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '创建失败';
            message.error(msg);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Title level={3} style={{ color: '#F8FAFC', margin: 0 }}>作业列表</Title>
                    <Text style={{ color: '#94A3B8' }}>共 {assignments.length} 个作业</Text>
                </div>
                {canCreate && (
                    <Button
                        type="primary"
                        icon={<Plus size={16} />}
                        onClick={() => setShowCreate(true)}
                        style={{ backgroundColor: '#2563EB' }}
                    >
                        发布作业
                    </Button>
                )}
            </div>

            {/* Error */}
            {error && (
                <Alert message={error} type="error" showIcon style={{ marginBottom: 24 }} />
            )}

            {/* Assignment List */}
            <List
                dataSource={assignments}
                locale={{
                    emptyText: (
                        <div className="text-center py-16 text-gray-500">
                            <FileText size={48} className="mx-auto mb-4 opacity-30" />
                            <Title level={5} style={{ color: '#6B7280' }}>暂无作业</Title>
                            {canCreate && <Text style={{ color: '#6B7280' }}>点击上方按钮发布第一个作业</Text>}
                        </div>
                    )
                }}
                renderItem={(assignment) => (
                    <List.Item style={{ padding: 0, borderBottom: 'none', marginBottom: 12 }}>
                        <Link
                            to={`/courses/${courseId}/assignments/${assignment.ID}`}
                            className="w-full block transition-all group"
                        >
                            <div
                                style={{
                                    background: 'rgba(31, 41, 55, 0.5)',
                                    border: '1px solid #374151',
                                    borderRadius: 12,
                                    padding: 20
                                }}
                                className="hover:border-blue-500/50 hover:bg-gray-800"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <Title level={5} className="group-hover:text-blue-400 transition-colors" style={{ color: '#F8FAFC', marginBottom: 8 }}>
                                            {assignment.title}
                                        </Title>
                                        <Paragraph ellipsis={{ rows: 2 }} style={{ color: '#94A3B8', marginBottom: 12 }}>
                                            {assignment.description || '暂无描述'}
                                        </Paragraph>
                                        <Space size="large" style={{ color: '#6B7280', fontSize: 14 }}>
                                            <Space size="small">
                                                <Calendar size={14} />
                                                <span>
                                                    {assignment.deadline
                                                        ? new Date(assignment.deadline).toLocaleDateString('zh-CN')
                                                        : '无截止日期'}
                                                </span>
                                            </Space>
                                            <Space size="small">
                                                <User size={14} />
                                                <span>教师 #{assignment.teacher_id}</span>
                                            </Space>
                                        </Space>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                                </div>
                            </div>
                        </Link>
                    </List.Item>
                )}
            />

            {/* Create Modal */}
            <Modal
                title="发布新作业"
                open={showCreate}
                onCancel={() => setShowCreate(false)}
                footer={null}
            >
                <Form layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
                    <Form.Item
                        name="title"
                        label="作业标题"
                        rules={[{ required: true, message: '请填写作业标题' }]}
                    >
                        <Input placeholder="输入作业标题" size="large" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea placeholder="输入作业描述" rows={4} />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setShowCreate(false)}>取消</Button>
                            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#2563EB' }}>发布</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
