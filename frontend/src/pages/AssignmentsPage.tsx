import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { FileText, Plus, Calendar, CheckCircle2, ChevronRight } from 'lucide-react';
import { assignmentApi, type AssignmentModel } from '@/api/assignment';
import { authStore } from '@/lib/auth-store';
import { List, Typography, Button, Spin, Alert, Modal, Form, Input, Space, message } from 'antd';

const { Title, Text, Paragraph } = Typography;

export function AssignmentsPage() {
    const { courseId } = useParams<{ courseId: string }>();
    const [showCreate, setShowCreate] = useState(false);
    const numericCourseId = Number(courseId);

    const user = authStore.getUser();
    const canCreate = user?.role === 'admin' || user?.role === 'teacher';

    const assignmentsQuery = useQuery({
        queryKey: ['course-assignments', numericCourseId],
        enabled: Number.isFinite(numericCourseId),
        queryFn: async () => {
            const payload = await assignmentApi.listCourseAssignments(numericCourseId);
            return payload.items;
        },
    });

    const createAssignmentMutation = useMutation({
        mutationFn: (values: { title: string; description: string }) => {
            if (!Number.isFinite(numericCourseId)) {
                throw new Error('courseId is required');
            }

            return assignmentApi.createAssignment(numericCourseId, values);
        },
        onSuccess: async () => {
            setShowCreate(false);
            message.success('作业发布成功');
            await assignmentsQuery.refetch();
        },
    });

    const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);

    const handleCreate = async (values: { title: string; description: string }) => {
        try {
            await createAssignmentMutation.mutateAsync(values);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '创建失败';
            message.error(msg);
        }
    };

    if (assignmentsQuery.isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="p-6">
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

            {assignmentsQuery.isError && (
                <Alert
                    message={assignmentsQuery.error instanceof Error ? assignmentsQuery.error.message : 'Failed to load assignments'}
                    type="error"
                    showIcon
                    style={{ marginBottom: 24 }}
                />
            )}

            <List
                dataSource={assignments}
                locale={{
                    emptyText: (
                        <div className="text-center py-16 text-gray-500">
                            <FileText size={48} className="mx-auto mb-4 opacity-30" />
                            <Title level={5} style={{ color: '#6B7280' }}>暂无作业</Title>
                            {canCreate && <Text style={{ color: '#6B7280' }}>点击上方按钮发布第一个作业</Text>}
                        </div>
                    ),
                }}
                renderItem={(assignment: AssignmentModel) => (
                    <List.Item style={{ padding: 0, borderBottom: 'none', marginBottom: 12 }}>
                        <Link
                            to={`/courses/${courseId}/assignments/${assignment.id}`}
                            className="w-full block transition-all group"
                        >
                            <div
                                style={{
                                    background: 'rgba(31, 41, 55, 0.5)',
                                    border: '1px solid #374151',
                                    borderRadius: 12,
                                    padding: 20,
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
                                                <CheckCircle2 size={14} />
                                                <span>{assignment.status ? `状态: ${assignment.status}` : `总分 ${assignment.maxScore ?? 100}`}</span>
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
                            <Button type="primary" htmlType="submit" loading={createAssignmentMutation.isPending} style={{ backgroundColor: '#2563EB' }}>发布</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
