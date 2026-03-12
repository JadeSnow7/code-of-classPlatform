import { useCourse } from '@/domains/course/useCourse';
import { Megaphone, Calendar, Users, UserCheck } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { announcementApi } from '@/api/announcement';
import { attendanceApi } from '@/api/attendance';
import { assignmentApi } from '@/api/assignment';
import { useAuth } from '@/domains/auth/useAuth';
import { logger } from '@/lib/logger';
import { Typography, Row, Col, Card, Statistic, Space } from 'antd';

const { Title, Text, Paragraph } = Typography;

export function OverviewPage() {
    const { course } = useCourse();
    const { user } = useAuth();
    const [stats, setStats] = useState({
        unreadAnnouncements: 0,
        pendingAssignments: 0,
        attendanceRate: 0,
    });

    const loadStats = useCallback(async () => {
        const courseId = course?.ID;
        if (!courseId) return;
        try {
            const [announcementData, attendanceData, assignmentData] = await Promise.all([
                announcementApi.getSummary(courseId),
                attendanceApi.getSummary(courseId),
                assignmentApi.getCourseAssignmentStats(courseId)
            ]);

            setStats({
                unreadAnnouncements: announcementData.unread_count,
                pendingAssignments: assignmentData.pending_count,
                attendanceRate: Math.round(attendanceData.attendance_rate * 100),
            });
        } catch (error) {
            logger.error('failed to load overview stats', { error, courseId });
        }
    }, [course?.ID]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
<<<<<<< HEAD:frontend/src/pages/OverviewPage.tsx
        void loadStats();
=======
        loadStats();
>>>>>>> origin/main:frontend-react/src/pages/OverviewPage.tsx
    }, [loadStats]);

    return (
        <div className="p-6">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* Hero */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(124, 58, 237, 0.2))',
                        borderRadius: 16,
                        padding: 32,
                        border: '1px solid rgba(59, 130, 246, 0.2)'
                    }}
                >
                    <Title level={2} style={{ color: '#F8FAFC', marginTop: 0 }}>{course?.name}</Title>
                    <Paragraph style={{ color: '#CBD5E1' }}>暂无描述</Paragraph>
                    <Space style={{ color: '#94A3B8', marginTop: 16 }}>
                        <Users size={16} />
                        <Text style={{ color: '#94A3B8' }}>授课教师ID: {course?.teacher_id}</Text>
                    </Space>
                </div>

                {/* Quick stats */}
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                        <Card
                            bordered={false}
                            style={{ background: 'rgba(31, 41, 55, 0.5)', border: '1px solid #374151', borderRadius: 12 }}
                        >
                            <Statistic
                                title={
                                    <Space>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Megaphone size={16} color="#60A5FA" />
                                        </div>
                                        <Text style={{ color: '#D1D5DB' }}>公告</Text>
                                    </Space>
                                }
                                value={stats.unreadAnnouncements}
                                suffix={<span style={{ fontSize: 14, color: '#6B7280', marginLeft: 8 }}>条未读公告</span>}
                                valueStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
                            />
                        </Card>
                    </Col>

                    <Col xs={24} md={8}>
                        <Card
                            bordered={false}
                            style={{ background: 'rgba(31, 41, 55, 0.5)', border: '1px solid #374151', borderRadius: 12 }}
                        >
                            <Statistic
                                title={
                                    <Space>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Calendar size={16} color="#34D399" />
                                        </div>
                                        <Text style={{ color: '#D1D5DB' }}>{user?.role === 'student' ? '待提交作业' : '待批改作业'}</Text>
                                    </Space>
                                }
                                value={stats.pendingAssignments}
                                suffix={<span style={{ fontSize: 14, color: '#6B7280', marginLeft: 8 }}>项</span>}
                                valueStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
                            />
                        </Card>
                    </Col>

                    <Col xs={24} md={8}>
                        <Card
                            bordered={false}
                            style={{ background: 'rgba(31, 41, 55, 0.5)', border: '1px solid #374151', borderRadius: 12 }}
                        >
                            <Statistic
                                title={
                                    <Space>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(167, 139, 250, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <UserCheck size={16} color="#A78BFA" />
                                        </div>
                                        <Text style={{ color: '#D1D5DB' }}>签到</Text>
                                    </Space>
                                }
                                value={stats.attendanceRate}
                                suffix={<span style={{ fontSize: 14, color: '#6B7280', marginLeft: 8 }}>% 出勤率</span>}
                                valueStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
                            />
                        </Card>
                    </Col>
                </Row>
            </Space>
        </div>
    );
}
