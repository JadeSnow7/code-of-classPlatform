import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { CourseProvider, useCourse } from '@/domains/course/useCourse';
import {
    LayoutDashboard,
    MessageSquare,
    BookOpen,
    Atom,
    FileText,
    FolderOpen,
    ChevronLeft,
    User as UserIcon,
    ClipboardList,
    PenLine,
    Megaphone,
    UserCheck,
} from 'lucide-react';
import { authStore } from '@/lib/auth-store';
import { useState } from 'react';
import { Layout, Menu, Button, Avatar, Spin, Typography, Dropdown } from 'antd';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const navItems = [
    { key: 'overview', label: '课程概览', icon: <LayoutDashboard size={16} /> },
    { key: 'announcements', label: '公告', icon: <Megaphone size={16} /> },
    { key: 'chapters', label: '章节学习', icon: <BookOpen size={16} /> },
    { key: 'attendance', label: '考勤', icon: <UserCheck size={16} /> },
    { key: 'chat', label: 'AI 答疑', icon: <MessageSquare size={16} /> },
    { key: 'writing', label: '写作提交', icon: <PenLine size={16} /> },
    { key: 'simulation', label: '电磁仿真', icon: <Atom size={16} /> },
    { key: 'assignments', label: '作业', icon: <FileText size={16} /> },
    { key: 'quizzes', label: '测验', icon: <ClipboardList size={16} /> },
    { key: 'resources', label: '资料', icon: <FolderOpen size={16} /> },
];

function CourseLayoutInner() {
    const { course, isLoading } = useCourse();
    const user = authStore.getUser();
    const location = useLocation();
    const navigate = useNavigate();

    const [collapsed, setCollapsed] = useState(false);

    // Determine selected key based on current path
    const pathParts = location.pathname.split('/');
    const currentKey = pathParts[pathParts.length - 1] || 'overview';

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0D0E15]">
                <Spin size="large" />
            </div>
        );
    }

    const handleMenuClick = ({ key }: { key: string }) => {
        navigate(key);
    };

    return (
        <Layout style={{ minHeight: '100vh' }}>
            {/* Sidebar */}
            <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={(value) => setCollapsed(value)}
                breakpoint="lg"
                theme="dark"
                width={240}
                style={{
                    backgroundColor: '#13141F',
                    borderRight: '1px solid #1E1F2E'
                }}
            >
                {/* Back Link & Branding */}
                <div style={{ padding: '16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #1E1F2E' }}>
                    <Button
                        type="text"
                        icon={<ChevronLeft size={20} />}
                        onClick={() => navigate('/courses')}
                        style={{ color: 'rgba(255,255,255,0.65)' }}
                    />
                    {!collapsed && (
                        <Text strong style={{ color: '#F8FAFC', marginLeft: 8, fontSize: 16 }}>
                            返回课程列表
                        </Text>
                    )}
                </div>

                {/* Course Metadata */}
                {!collapsed && (
                    <div style={{ padding: '24px 16px', borderBottom: '1px solid #1E1F2E' }}>
                        <Text strong style={{ color: '#F8FAFC', display: 'block', fontSize: 16, marginBottom: 4 }} ellipsis>
                            {course?.name || '课程'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Teacher ID: {course?.teacher_id}
                        </Text>
                    </div>
                )}

                {/* Navigation Menu */}
                <Menu
                    theme="dark"
                    mode="inline"
                    selectedKeys={[currentKey]}
                    onClick={handleMenuClick}
                    items={navItems}
                    style={{ backgroundColor: 'transparent', border: 'none', padding: '16px 8px' }}
                />
            </Sider>

            <Layout>
                {/* Header */}
                <Header style={{
                    padding: '0 24px',
                    background: '#13141F',
                    borderBottom: '1px solid #1E1F2E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end'
                }}>
                    <Dropdown
                        menu={{
                            items: [
                                { key: 'profile', label: <Link to="/profile">个人中心</Link> },
                                { key: 'logout', label: '退出登录', onClick: () => { authStore.clearToken(); navigate('/login'); } }
                            ]
                        }}
                        placement="bottomRight"
                    >
                        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 12 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{user?.name}</Text>
                            <Avatar size={36} style={{ background: 'linear-gradient(135deg, #60A5FA, #8B5CF6)' }}>
                                <UserIcon size={18} />
                            </Avatar>
                        </div>
                    </Dropdown>
                </Header>

                {/* Main Content */}
                <Content style={{
                    margin: 0,
                    height: 'calc(100vh - 64px)',
                    overflowY: 'auto',
                    backgroundColor: '#0D0E15',
                }}>
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
}

export function CourseLayout() {
    return (
        <CourseProvider>
            <CourseLayoutInner />
        </CourseProvider>
    );
}
