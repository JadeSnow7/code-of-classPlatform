import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Tabs,
    Upload,
    List,
    Tag,
    Button,
    Avatar,
    Typography,
    Space,
    Badge,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    UploadOutlined,
    ThunderboltOutlined,
    StarOutlined,
    CloudOutlined,
} from '@ant-design/icons';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useMobile } from '@/hooks/useMobile';
import { AICourseDrawer } from '@/components/course/AICourseDrawer';

const { Title, Text } = Typography;
const ItemTypes = { ASSIGNMENT: 'assignment' };

interface AssignmentItem {
    id: number;
    title: string;
    dueDate: string;
    status: 'pending' | 'overdue' | 'completed';
    completed: boolean;
}

function DraggableAssignment({ assignment }: { assignment: AssignmentItem }) {
    const [{ isDragging }, drag] = useDrag({
        type: ItemTypes.ASSIGNMENT,
        item: { id: assignment.id },
        collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    });

    const statusColor = {
        completed: 'success',
        overdue: 'error',
        pending: 'warning',
    } as const;
    const statusLabel = {
        completed: '已提交',
        overdue: '已逾期',
        pending: '未提交',
    };

    return (
        <div
            ref={drag as unknown as React.Ref<HTMLDivElement>}
            className="p-4 rounded-lg mb-3 cursor-move transition-all"
            style={{
                backgroundColor: 'var(--surface-700)',
                opacity: isDragging ? 0.5 : 1,
                transform: isDragging ? 'scale(0.95) rotate(2deg)' : 'none',
            }}
        >
            <div className="flex items-start gap-3">
                <div className="mt-1">
                    {assignment.completed ? (
                        <CheckCircleOutlined style={{ color: 'var(--semantic-success)', fontSize: 18 }} />
                    ) : (
                        <div className="w-4 h-4 rounded border-2" style={{ borderColor: 'var(--primary-700)' }} />
                    )}
                </div>
                <div className="flex-1">
                    <Text strong delete={assignment.completed} style={{ color: 'var(--text-dark)', display: 'block', marginBottom: 4 }}>
                        {assignment.title}
                    </Text>
                    <Space size={8}>
                        <Tag color={statusColor[assignment.status]}>{statusLabel[assignment.status]}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <ClockCircleOutlined className="mr-1" />
                            {assignment.dueDate}
                        </Text>
                    </Space>
                </div>
            </div>
        </div>
    );
}

function DropZone({ onDrop }: { onDrop: (id: number) => void }) {
    const [{ isOver }, drop] = useDrop({
        accept: ItemTypes.ASSIGNMENT,
        drop: (item: { id: number }) => onDrop(item.id),
        collect: (monitor) => ({ isOver: monitor.isOver() }),
    });

    return (
        <div
            ref={drop as unknown as React.Ref<HTMLDivElement>}
            className="p-8 rounded-lg border-2 border-dashed text-center transition-all"
            style={{
                borderColor: isOver ? 'var(--primary-500)' : 'var(--surface-700)',
                backgroundColor: isOver ? 'rgba(37,99,235,0.1)' : 'transparent',
            }}
        >
            <UploadOutlined style={{ fontSize: 32, color: 'var(--primary-300)', marginBottom: 8, display: 'block' }} />
            <Text style={{ color: 'var(--text-dark)' }}>{isOver ? '松开以提交' : '将作业拖拽至此处提交'}</Text>
        </div>
    );
}

export function CourseExperiencePage() {
    const { courseId } = useParams();
    const isMobile = useMobile();
    const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
    const [assignments, setAssignments] = useState<AssignmentItem[]>([
        { id: 1, title: '实验仿真实验报告', dueDate: '明天 23:59', status: 'pending', completed: false },
        { id: 2, title: '核心概念推导', dueDate: '3天后', status: 'pending', completed: false },
        { id: 3, title: '系统分析作业', dueDate: '2天前', status: 'overdue', completed: false },
        { id: 4, title: '系统建模分析', dueDate: '已提交', status: 'completed', completed: true },
    ]);

    const handleDrop = (id: number) => {
        setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, completed: true, status: 'completed' } : a)));
        message.success('作业提交成功');
    };

    const tabItems = [
        {
            key: 'assignments',
            label: <Badge count={assignments.filter((a) => a.status === 'pending').length} size="small">作业</Badge>,
            children: (
                <DndProvider backend={HTML5Backend}>
                    <div className="grid grid-cols-3 gap-6 p-6">
                        <div className="col-span-2 space-y-3">
                            {assignments.map((a) => (
                                <DraggableAssignment key={a.id} assignment={a} />
                            ))}
                        </div>
                        <div>
                            <DropZone onDrop={handleDrop} />
                            <div className="mt-6">
                                <Button
                                    type="primary"
                                    block
                                    icon={<CloudOutlined />}
                                    style={{ backgroundColor: 'var(--primary-500)', borderColor: 'var(--primary-500)' }}
                                    onClick={() => setAiDrawerOpen(true)}
                                >
                                    云端 AI 课程答疑
                                </Button>
                            </div>
                        </div>
                    </div>
                </DndProvider>
            ),
        },
        {
            key: 'resources',
            label: '资料',
            children: (
                <div className="p-6">
                    <Upload.Dragger
                        multiple
                        style={{
                            backgroundColor: 'var(--surface-800)',
                            borderColor: 'var(--surface-700)',
                            color: 'var(--text-dark)',
                        }}
                    >
                        <p className="ant-upload-drag-icon">
                            <UploadOutlined style={{ fontSize: 40, color: 'var(--primary-300)' }} />
                        </p>
                        <p style={{ color: 'var(--text-dark)' }}>点击或拖拽文件到此处上传课程资料</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>支持 PDF、Word、PPT、图片等格式</p>
                    </Upload.Dragger>
                </div>
            ),
        },
        {
            key: 'chapters',
            label: '章节',
            children: (
                <div className="p-6">
                    <List
                        dataSource={['第一章：学科基础理论', '第二章：核心理论体系', '第三章：系统传播机制']}
                        renderItem={(item, i) => (
                            <List.Item>
                                <List.Item.Meta
                                    avatar={<Avatar style={{ backgroundColor: 'var(--primary-700)' }}>{i + 1}</Avatar>}
                                    title={<Text style={{ color: 'var(--text-dark)' }}>{item}</Text>}
                                />
                            </List.Item>
                        )}
                    />
                </div>
            ),
        },
    ];

    if (isMobile) {
        return (
            <div style={{ backgroundColor: 'var(--surface-50)', minHeight: '100%' }}>
                <div className="relative h-44 bg-gradient-to-br from-blue-500 to-blue-700">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                        <Title level={4} style={{ color: 'white', margin: 0 }}>
                            综合课程（课程 {courseId}）
                        </Title>
                        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>张明远 副教授</Text>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    <div className="p-4 rounded-xl bg-white flex items-center justify-between" style={{ borderLeft: '4px solid var(--primary-700)' }}>
                        <div>
                            <Text strong style={{ color: 'var(--text-light)' }}>
                                课堂签到
                            </Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                综合课 A201 · 14:30-16:10
                            </Text>
                        </div>
                        <Button type="primary" size="small" icon={<ThunderboltOutlined />}>
                            签到
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {assignments.map((a) => (
                            <div key={a.id} className="bg-white rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                    {a.completed ? (
                                        <CheckCircleOutlined style={{ color: 'var(--semantic-success)', marginTop: 2 }} />
                                    ) : (
                                        <div
                                            className="w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5"
                                            style={{ borderColor: 'var(--primary-700)' }}
                                        />
                                    )}
                                    <div className="flex-1">
                                        <Text strong delete={a.completed} style={{ color: 'var(--text-light)', display: 'block', marginBottom: 4 }}>
                                            {a.title}
                                        </Text>
                                        <Space>
                                            <Tag color={a.status === 'completed' ? 'success' : a.status === 'overdue' ? 'error' : 'warning'}>
                                                {a.status === 'completed' ? '已提交' : a.status === 'overdue' ? '已逾期' : '未提交'}
                                            </Tag>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {a.dueDate}
                                            </Text>
                                        </Space>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Button
                        type="primary"
                        block
                        icon={<StarOutlined />}
                        style={{ backgroundColor: 'var(--primary-500)', borderColor: 'var(--primary-500)' }}
                        onClick={() => setAiDrawerOpen(true)}
                    >
                        打开云端 AI 课程答疑
                    </Button>
                </div>

                <AICourseDrawer open={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} isMobile />
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: 'var(--surface-950)', minHeight: '100%' }}>
            <div className="px-8 py-6 border-b" style={{ borderColor: 'var(--surface-700)' }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Avatar size={48} style={{ background: 'linear-gradient(135deg, #60A5FA, #1D4ED8)' }}>
                            张
                        </Avatar>
                        <div>
                            <Title level={3} style={{ color: 'var(--text-dark)', margin: 0 }}>
                                综合课程（课程 {courseId}）
                            </Title>
                            <Text type="secondary">张明远 副教授</Text>
                        </div>
                    </div>
                    <div
                        className="flex items-center gap-4 px-5 py-3 rounded-xl"
                        style={{ backgroundColor: 'var(--surface-800)', borderLeft: '4px solid var(--primary-700)' }}
                    >
                        <div>
                            <Text strong style={{ color: 'var(--text-dark)', display: 'block' }}>
                                课堂签到
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                综合课 A201 · 14:30-16:10
                            </Text>
                        </div>
                        <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => message.info('签到功能需在课堂范围内使用')}>
                            签到
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs items={tabItems} style={{ padding: '0 32px' }} tabBarStyle={{ color: 'var(--text-muted)' }} />

            <AICourseDrawer open={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
        </div>
    );
}
