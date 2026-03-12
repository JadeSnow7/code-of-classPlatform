import { useState, useEffect } from 'react';
import {
    User, Shield, BookOpen, LogOut, Clock, Trophy,
    FileText, ClipboardCheck, Plus
} from 'lucide-react';
import { authStore, type User as UserType } from '@/lib/auth-store';
import { useNavigate } from 'react-router-dom';
import { userApi, type StudentStats, type TeacherStats } from '@/api/user';
import { Card, Row, Col, Typography, Button, Spin, Alert, Avatar, Statistic, Tag, List, Space } from 'antd';

const { Title, Text } = Typography;

export function ProfilePage() {
    const navigate = useNavigate();
    const [user, setUser] = useState<UserType | null>(null);
    const [stats, setStats] = useState<StudentStats | TeacherStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isStudent = user?.role === 'student';

    useEffect(() => {
        const currentUser = authStore.getUser();
        setUser(currentUser);
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await userApi.getStats();
            setStats(data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '加载统计数据失败';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        authStore.clearToken();
        navigate('/login');
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Spin size="large" />
            </div>
        );
    }

    const roleLabels: Record<string, string> = {
        admin: '管理员',
        teacher: '教师',
        assistant: '助教',
        student: '学生',
    };

    const studentStats = stats as StudentStats;
    const teacherStats = stats as TeacherStats;

    return (
        <div className="min-h-screen p-6" style={{ background: '#0D0E15' }}>
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <Space size="large">
                        <Avatar
                            size={80}
                            icon={<User size={40} />}
                            style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
                        />
                        <div>
                            <Title level={3} style={{ color: '#F8FAFC', margin: 0 }}>{user.name}</Title>
                            <Tag color="blue" style={{ marginTop: 8 }}>{roleLabels[user.role] || user.role}</Tag>
                        </div>
                    </Space>
                    {!isStudent && (
                        <Button
                            type="primary"
                            icon={<Plus size={16} />}
                            onClick={() => navigate('/courses')}
                            style={{ background: '#8B5CF6', borderColor: '#8B5CF6' }}
                        >
                            创建课程
                        </Button>
                    )}
                </div>

                {/* Content */}
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <Spin />
                    </div>
                ) : error ? (
                    <Alert message={error} type="error" showIcon style={{ marginBottom: 24 }} />
                ) : stats && (
                    <>
                        {/* Selected Stats Overview */}
                        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                            {isStudent ? (
                                <>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#60A5FA' }}>课程数</Text>} value={studentStats.courses_count} prefix={<BookOpen size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#34D399' }}>作业完成</Text>} value={`${studentStats.assignments_submitted}/${studentStats.assignments_total}`} prefix={<FileText size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#FBBF24' }}>测验平均分</Text>} value={studentStats.quizzes_avg_score.toFixed(1)} prefix={<Trophy size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#F87171' }}>待办事项</Text>} value={studentStats.pending_count} prefix={<Clock size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                </>
                            ) : (
                                <>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#60A5FA' }}>创建课程</Text>} value={teacherStats.courses_created} prefix={<BookOpen size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#34D399' }}>发布作业</Text>} value={teacherStats.assignments_created} prefix={<FileText size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(167, 139, 250, 0.1)', borderColor: 'rgba(167, 139, 250, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#A78BFA' }}>创建测验</Text>} value={teacherStats.quizzes_created} prefix={<ClipboardCheck size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Card bordered={false} style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                                            <Statistic title={<Text style={{ color: '#F87171' }}>待批改</Text>} value={teacherStats.pending_grades} prefix={<Clock size={16} />} valueStyle={{ color: '#E2E8F0' }} />
                                        </Card>
                                    </Col>
                                </>
                            )}
                        </Row>

                        <Row gutter={[24, 24]}>
                            {/* Left Column */}
                            <Col xs={24} md={12}>
                                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                                    <Card
                                        title={<><Shield size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: '#60A5FA' }} />账户信息</>}
                                        bordered={false}
                                        style={{ background: '#13141F', border: '1px solid #1E1F2E' }}
                                    >
                                        <List itemLayout="horizontal" size="small">
                                            <List.Item><Text type="secondary">用户ID</Text><Text style={{ color: '#E2E8F0' }}>{user.id}</Text></List.Item>
                                            <List.Item><Text type="secondary">用户名</Text><Text style={{ color: '#E2E8F0' }}>{user.name}</Text></List.Item>
                                            <List.Item><Text type="secondary">角色</Text><Text style={{ color: '#E2E8F0' }}>{roleLabels[user.role] || user.role}</Text></List.Item>
                                        </List>
                                    </Card>

                                    {isStudent ? (
                                        <Card
                                            title={<><Clock size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: '#F87171' }} />待办事项</>}
                                            bordered={false}
                                            style={{ background: '#13141F', border: '1px solid #1E1F2E' }}
                                        >
                                            <List
                                                dataSource={studentStats.pending}
                                                renderItem={(item) => (
                                                    <List.Item>
                                                        <List.Item.Meta
                                                            title={<Text style={{ color: '#E2E8F0' }}>{item.title}</Text>}
                                                            description={<Tag color={item.type === 'assignment' ? 'blue' : 'purple'}>{item.type === 'assignment' ? '作业' : '测验'}</Tag>}
                                                        />
                                                        <Text type="secondary" style={{ fontSize: 12 }}>截止: {new Date(item.deadline).toLocaleDateString()}</Text>
                                                    </List.Item>
                                                )}
                                                locale={{ emptyText: <Text type="secondary">暂无待办</Text> }}
                                            />
                                        </Card>
                                    ) : (
                                        <Card
                                            title={<Text style={{ color: '#E2E8F0' }}>快捷操作</Text>}
                                            bordered={false}
                                            style={{ background: '#13141F', border: '1px solid #1E1F2E' }}
                                        >
                                            <Button type="dashed" block icon={<Plus size={16} />} onClick={() => navigate('/courses')}>
                                                创建新课程
                                            </Button>
                                        </Card>
                                    )}
                                </Space>
                            </Col>

                            {/* Right Column */}
                            <Col xs={24} md={12}>
                                <Card
                                    title={<>
                                        {isStudent ? (
                                            <><Trophy size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: '#FBBF24' }} />最近活动</>
                                        ) : (
                                            <><FileText size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: '#34D399' }} />最近提交</>
                                        )}
                                    </>}
                                    bordered={false}
                                    style={{ background: '#13141F', border: '1px solid #1E1F2E', height: '100%' }}
                                >
                                    <List
                                        dataSource={isStudent ? studentStats.recent_activity : teacherStats.recent_submissions}
                                        renderItem={(activity) => (
                                            <List.Item>
                                                <List.Item.Meta
                                                    title={<Text style={{ color: '#E2E8F0' }}>{activity.title}</Text>}
                                                    description={<Tag color={activity.type === 'assignment_submit' ? 'green' : 'orange'}>{activity.type === 'assignment_submit' ? '作业' : '测验'}</Tag>}
                                                />
                                                <div style={{ textAlign: 'right' }}>
                                                    {isStudent && activity.score !== undefined && (
                                                        <Text strong style={{ display: 'block', color: '#E2E8F0' }}>{activity.score}/{activity.max_score}</Text>
                                                    )}
                                                    <Text type="secondary" style={{ fontSize: 12 }}>{new Date(activity.created_at).toLocaleDateString()}</Text>
                                                </div>
                                            </List.Item>
                                        )}
                                        locale={{ emptyText: <Text type="secondary">暂无记录</Text> }}
                                    />
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}

                <div style={{ marginTop: 32 }}>
                    <Button
                        danger
                        block
                        size="large"
                        icon={<LogOut size={18} />}
                        onClick={handleLogout}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    >
                        退出登录
                    </Button>
                </div>

<<<<<<< HEAD:frontend/src/pages/ProfilePage.tsx
                {/* Footer */}
                <p className="text-center text-gray-600 text-sm mt-8">
                    智能教学平台 v1.0
=======
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', marginTop: 32, fontSize: 13 }}>
                    电磁场教学平台 v1.0
>>>>>>> origin/main:frontend-react/src/pages/ProfilePage.tsx
                </p>
            </div>
        </div>
    );
}
