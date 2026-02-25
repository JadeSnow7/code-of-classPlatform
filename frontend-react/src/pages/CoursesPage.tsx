import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { courseApi, type Course } from '@/api/course';
import { useAuth } from '@/domains/auth/useAuth';
import { BookOpen, LogOut, User, Plus } from 'lucide-react';
import { Button, Card, Spin, Typography, Space, Modal, Form, Input, message } from 'antd';

const { Title, Text } = Typography;

export function CoursesPage() {
    const { user, logout } = useAuth();
    const [courses, setCourses] = useState<Course[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const canCreate = user?.role === 'admin' || user?.role === 'teacher';

    useEffect(() => {
        loadCourses();
    }, []);

    const loadCourses = async () => {
        setIsLoading(true);
        try {
            const data = await courseApi.list();
            setCourses(data);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCourse = async (values: { name: string; code: string; semester: string }) => {
        try {
            await courseApi.create(values);
            setShowCreateModal(false);
            message.success('创建成功');
            loadCourses();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '创建失败';
            message.error(msg);
        }
    };

    return (
        <div className="min-h-screen bg-[#0D0E15]">
            {/* Header */}
            <header style={{
                borderBottom: '1px solid #1E1F2E',
                backgroundColor: 'rgba(19, 20, 31, 0.8)',
                backdropFilter: 'blur(8px)',
                position: 'sticky',
                top: 0,
                zIndex: 10
            }}>
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                            <BookOpen size={20} color="#60A5FA" />
                        </div>
                        <Title level={4} style={{ color: '#F8FAFC', margin: 0 }}>我的课程</Title>
                    </div>
                    <Space size="middle">
                        <Link
                            to="/profile"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                            style={{ color: 'rgba(255,255,255,0.65)' }}
                        >
                            <User size={16} />
                            <span className="hidden sm:inline">{user?.name} ({user?.role})</span>
                        </Link>
                        <Button
                            type="text"
                            icon={<LogOut size={18} />}
                            onClick={logout}
                            style={{ color: 'rgba(255,255,255,0.65)' }}
                        />
                    </Space>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-6xl mx-auto px-4 py-8">
                {canCreate && (
                    <div className="mb-6">
                        <Button
                            type="primary"
                            icon={<Plus size={16} />}
                            onClick={() => setShowCreateModal(true)}
                            size="large"
                            style={{ backgroundColor: '#2563EB' }}
                        >
                            创建课程
                        </Button>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Spin size="large" />
                    </div>
                ) : courses.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen size={48} color="rgba(255,255,255,0.2)" className="mx-auto mb-4" />
                        <Title level={4} style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>暂无课程</Title>
                        <Text style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {canCreate ? '点击上方按钮创建第一个课程' : '等待教师添加课程'}
                        </Text>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {courses.map((course) => (
                            <Link key={course.ID} to={`/courses/${course.ID}`}>
                                <Card
                                    hoverable
                                    bordered={false}
                                    style={{
                                        backgroundColor: '#13141F',
                                        border: '1px solid #1E1F2E',
                                        borderRadius: 16
                                    }}
                                    bodyStyle={{ padding: 24 }}
                                >
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                                        style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}>
                                        <BookOpen size={24} color="#FFF" />
                                    </div>
                                    <Title level={5} style={{ color: '#F8FAFC', marginBottom: 8, transition: 'color 0.3s' }}>
                                        {course.name}
                                    </Title>
                                    <Space size="small">
                                        {course.code && (
                                            <span style={{ backgroundColor: '#1E293B', color: 'rgba(255,255,255,0.65)', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>
                                                {course.code}
                                            </span>
                                        )}
                                        {course.semester && (
                                            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                                                {course.semester}
                                            </Text>
                                        )}
                                    </Space>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </main>

            {/* Create Modal */}
            <Modal
                title="创建课程"
                open={showCreateModal}
                onCancel={() => setShowCreateModal(false)}
                footer={null}
                style={{ top: 100 }}
                bodyStyle={{ paddingTop: 16 }}
            >
                <Form layout="vertical" onFinish={handleCreateCourse}>
                    <Form.Item
                        name="name"
                        label="课程名称"
                        rules={[{ required: true, message: '请输入课程名称' }]}
                    >
                        <Input placeholder="如：电磁场理论" size="large" />
                    </Form.Item>
                    <Form.Item name="code" label="课程代码">
                        <Input placeholder="如：EE301" size="large" />
                    </Form.Item>
                    <Form.Item name="semester" label="学期">
                        <Input placeholder="如：2024春季" size="large" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setShowCreateModal(false)}>取消</Button>
                            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#2563EB' }}>
                                创建
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
