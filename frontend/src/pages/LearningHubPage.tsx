import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Progress,
  Statistic,
  Tag,
  Typography,
  Upload,
  message,
  type UploadProps,
} from 'antd';
import {
  FireOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useMobile } from '@/hooks/useMobile';
import { dashboardApi, type DashboardSummary } from '@/api/dashboard';
import {
  knowledgeBaseApi,
  type CreateKnowledgeBaseRequest,
  type KnowledgeBase,
  type KnowledgeBaseFile,
} from '@/api/knowledgeBase';
import { courseApi } from '@/api/course';
import { assignmentApi, type Assignment } from '@/api/assignment';
import { logger } from '@/lib/logger';

const { Title, Text } = Typography;

type RadarAxis = '逻辑性' | '创造力' | '深度' | '表达清晰度' | '引用规范' | '原创性';
const RADAR_AXES: RadarAxis[] = ['逻辑性', '创造力', '深度', '表达清晰度', '引用规范', '原创性'];

type PendingAssignmentItem = {
  id: number;
  title: string;
  courseName: string;
  dueAt?: string;
};

function getHeatmapColor(value: number): string {
  if (value <= 0) return 'var(--surface-700)';
  if (value < 1) return '#1e3a5f';
  if (value < 2) return '#1e3a8a';
  if (value < 3) return '#2563eb';
  return '#60a5fa';
}

function buildHeatmap(cells: DashboardSummary['activity_heatmap'] | undefined): number[][] {
  const values = (cells ?? [])
    .map((item) => item.hours)
    .filter((hours) => Number.isFinite(hours))
    .slice(-84);

  if (values.length === 0) {
    return Array.from({ length: 12 }, () => Array.from({ length: 7 }, () => 0));
  }

  const padded = [...Array.from({ length: Math.max(0, 84 - values.length) }, () => 0), ...values];
  const matrix: number[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    matrix.push(padded.slice(i, i + 7));
  }
  return matrix;
}

function toDeadlineTimestamp(assignment: Assignment): number {
  const raw = assignment.deadline ?? assignment.due_date;
  if (!raw) return Number.POSITIVE_INFINITY;
  const value = Date.parse(raw);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function isPendingAssignment(assignment: Assignment): boolean {
  if (assignment.status === 'graded' || assignment.status === 'submitted') return false;
  if (!assignment.submission) return true;
  return assignment.submission.grade === null || assignment.submission.grade === undefined;
}

function formatDueText(raw?: string): string {
  if (!raw) return '无截止时间';
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return raw;
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LearningHubPage() {
  const isMobile = useMobile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignmentItem[]>([]);

  const [showCreateKbModal, setShowCreateKbModal] = useState(false);
  const [creatingKb, setCreatingKb] = useState(false);
  const [newKbName, setNewKbName] = useState('');

  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<number | null>(null);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeBaseFile[]>([]);
  const [knowledgeFilesLoading, setKnowledgeFilesLoading] = useState(false);
  const [knowledgeFilesError, setKnowledgeFilesError] = useState<string | null>(null);

  const loadKnowledgeFiles = useCallback(async (knowledgeBaseId: number) => {
    setKnowledgeFilesLoading(true);
    setKnowledgeFilesError(null);
    try {
      const files = await knowledgeBaseApi.listFiles(knowledgeBaseId);
      setKnowledgeFiles(files);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '知识库文件接口暂不可用';
      setKnowledgeFiles([]);
      setKnowledgeFilesError(messageText);
    } finally {
      setKnowledgeFilesLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [dashboardResult, knowledgeResult, coursesResult] = await Promise.allSettled([
      dashboardApi.get(),
      knowledgeBaseApi.list(),
      courseApi.list(),
    ]);

    if (dashboardResult.status === 'fulfilled') {
      setDashboard(dashboardResult.value);
    } else {
      logger.error('failed to load dashboard summary', { error: dashboardResult.reason });
      setDashboard(null);
      setError('学习概览加载失败，请稍后重试。');
    }

    if (knowledgeResult.status === 'fulfilled') {
      setKnowledgeBases(knowledgeResult.value);
      if (knowledgeResult.value.length > 0) {
        const nextId = selectedKnowledgeBaseId ?? knowledgeResult.value[0].id;
        setSelectedKnowledgeBaseId(nextId);
      } else {
        setSelectedKnowledgeBaseId(null);
        setKnowledgeFiles([]);
      }
    } else {
      logger.error('failed to load knowledge bases', { error: knowledgeResult.reason });
      setKnowledgeBases([]);
    }

    if (coursesResult.status === 'fulfilled') {
      const courses = coursesResult.value;
      const assignmentResults = await Promise.allSettled(
        courses.slice(0, 10).map(async (course) => {
          const items = await assignmentApi.listByCourse(course.ID);
          return {
            courseName: course.name,
            assignments: items,
          };
        })
      );

      const merged = assignmentResults
        .filter((result): result is PromiseFulfilledResult<{ courseName: string; assignments: Assignment[] }> => result.status === 'fulfilled')
        .flatMap((result) => {
          return result.value.assignments
            .filter(isPendingAssignment)
            .map((assignment) => ({
              id: assignment.ID,
              title: assignment.title,
              courseName: result.value.courseName,
              dueAt: assignment.deadline ?? assignment.due_date ?? undefined,
              dueTs: toDeadlineTimestamp(assignment),
            }));
        })
        .sort((a, b) => a.dueTs - b.dueTs)
        .slice(0, 8)
        .map(({ id, title, courseName, dueAt }) => ({ id, title, courseName, dueAt }));

      setPendingAssignments(merged);
    } else {
      logger.error('failed to load courses for assignment aggregation', { error: coursesResult.reason });
      setPendingAssignments([]);
    }

    setLoading(false);
  }, [selectedKnowledgeBaseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedKnowledgeBaseId) {
      setKnowledgeFiles([]);
      setKnowledgeFilesError(null);
      return;
    }
    void loadKnowledgeFiles(selectedKnowledgeBaseId);
  }, [selectedKnowledgeBaseId, loadKnowledgeFiles]);

  const heatmapData = useMemo(() => buildHeatmap(dashboard?.activity_heatmap), [dashboard?.activity_heatmap]);

  const weekHours = useMemo(() => {
    const lastWeek = heatmapData[heatmapData.length - 1] ?? [];
    return lastWeek.reduce((sum, item) => sum + item, 0);
  }, [heatmapData]);

  const streakDays = useMemo(() => {
    const flat = heatmapData.flat();
    let streak = 0;
    for (let i = flat.length - 1; i >= 0; i -= 1) {
      if (flat[i] > 0) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }, [heatmapData]);

  const radarValues = useMemo(() => {
    const fromApi = dashboard?.writing_radar ?? {};
    return RADAR_AXES.map((axis) => fromApi[axis] ?? 0);
  }, [dashboard?.writing_radar]);

  const handleCreateKnowledgeBase = async () => {
    const payload: CreateKnowledgeBaseRequest = { name: newKbName.trim() };
    if (!payload.name) return;
    setCreatingKb(true);
    try {
      const created = await knowledgeBaseApi.create(payload);
      message.success('知识库创建成功');
      setShowCreateKbModal(false);
      setNewKbName('');
      await loadData();
      setSelectedKnowledgeBaseId(created.id);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '创建知识库失败';
      message.error(messageText);
    } finally {
      setCreatingKb(false);
    }
  };

  const handleUploadKnowledgeFile: NonNullable<UploadProps['customRequest']> = async (options) => {
    const kbId = selectedKnowledgeBaseId;
    if (!kbId) {
      options.onError?.(new Error('请先选择知识库'));
      return;
    }

    try {
      const file = options.file as File;
      await knowledgeBaseApi.uploadFile(kbId, file, (percent) => {
        if (percent >= 0) {
          options.onProgress?.({ percent });
        }
      });
      options.onSuccess?.({}, options.file);
      message.success('文件上传成功');
      await loadData();
      await loadKnowledgeFiles(kbId);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '文件上传失败';
      options.onError?.(new Error(messageText));
      message.error(messageText);
    }
  };

  const handleDeleteKnowledgeFile = async (fileId: number) => {
    if (!selectedKnowledgeBaseId) return;
    try {
      await knowledgeBaseApi.deleteFile(selectedKnowledgeBaseId, fileId);
      message.success('文件删除成功');
      await loadKnowledgeFiles(selectedKnowledgeBaseId);
      await loadData();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '文件删除失败';
      message.error(messageText);
    }
  };

  const knowledgeBaseCount = dashboard?.knowledge_bases_count ?? knowledgeBases.length;
  const pendingCount = dashboard?.pending_assignments_count ?? pendingAssignments.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-16">
        <Progress type="circle" percent={70} status="active" />
      </div>
    );
  }

  return (
    <div className={isMobile ? 'p-4 space-y-4' : 'p-8'} style={{ backgroundColor: isMobile ? 'var(--surface-50)' : 'var(--surface-950)', minHeight: '100%' }}>
      <div className="max-w-[1600px] mx-auto space-y-6">
        {error && (
          <Alert
            type="warning"
            showIcon
            message={error}
          />
        )}

        <Card
          style={{
            backgroundColor: isMobile ? undefined : 'var(--surface-800)',
            border: isMobile ? undefined : '1px solid var(--surface-700)',
          }}
          styles={{ body: { padding: isMobile ? 16 : 24 } }}
        >
          <div className="flex items-center justify-between mb-4">
            <Title level={isMobile ? 5 : 4} style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)', margin: 0 }}>
              Learning Activity
            </Title>
            <Tag color="blue">本周 {weekHours.toFixed(1)}h</Tag>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-2">
            {heatmapData.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((value, dayIndex) => (
                  <div
                    key={dayIndex}
                    className="w-3.5 h-3.5 rounded-sm"
                    style={{ backgroundColor: getHeatmapColor(value) }}
                    title={`${value.toFixed(1)}h`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <FireOutlined style={{ color: 'var(--semantic-warning)' }} />
            <Text style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)' }}>
              连续学习 {streakDays} 天
            </Text>
          </div>
        </Card>

        <div className={isMobile ? 'space-y-4' : 'grid grid-cols-3 gap-6'}>
          <Card
            className={isMobile ? undefined : 'col-span-2'}
            style={{
              backgroundColor: isMobile ? undefined : 'var(--surface-800)',
              border: isMobile ? undefined : '1px solid var(--surface-700)',
            }}
            title={<span style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)' }}>我的知识库（{knowledgeBaseCount}）</span>}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreateKbModal(true)}>
                新建知识库
              </Button>
            }
          >
            {knowledgeBases.length === 0 ? (
              <Empty description="暂无知识库" />
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {knowledgeBases.map((kb) => (
                    <Button
                      key={kb.id}
                      type={selectedKnowledgeBaseId === kb.id ? 'primary' : 'default'}
                      onClick={() => setSelectedKnowledgeBaseId(kb.id)}
                    >
                      {kb.name} ({kb.file_count})
                    </Button>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <Text style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)' }}>知识库文件</Text>
                  <Upload
                    showUploadList={false}
                    customRequest={handleUploadKnowledgeFile}
                    disabled={!selectedKnowledgeBaseId}
                  >
                    <Button icon={<UploadOutlined />} disabled={!selectedKnowledgeBaseId}>上传文件</Button>
                  </Upload>
                </div>

                {knowledgeFilesError && (
                  <Alert
                    type="info"
                    showIcon
                    message={`文件接口状态：${knowledgeFilesError}`}
                  />
                )}

                <List
                  loading={knowledgeFilesLoading}
                  dataSource={knowledgeFiles}
                  locale={{ emptyText: '暂无文件' }}
                  renderItem={(file) => (
                    <List.Item
                      actions={[
                        <Button
                          key="delete"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => void handleDeleteKnowledgeFile(file.id)}
                        >
                          删除
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<FileTextOutlined style={{ color: 'var(--primary-500)' }} />}
                        title={file.name}
                        description={
                          <span>
                            {file.size_bytes ? `${(file.size_bytes / 1024).toFixed(1)} KB` : '未知大小'}
                            {file.status ? ` · ${file.status}` : ''}
                          </span>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
            )}
          </Card>

          <Card
            style={{
              backgroundColor: isMobile ? undefined : 'var(--surface-800)',
              border: isMobile ? undefined : '1px solid var(--surface-700)',
            }}
            title={<span style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)' }}>待办作业（{pendingCount}）</span>}
          >
            <List
              dataSource={pendingAssignments}
              locale={{ emptyText: '暂无待办作业' }}
              renderItem={(item) => (
                <List.Item>
                  <div className="w-full">
                    <Text strong style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)', display: 'block' }}>
                      {item.title}
                    </Text>
                    <Tag color="blue" style={{ marginTop: 6 }}>{item.courseName}</Tag>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ClockCircleOutlined className="mr-1" />
                      {formatDueText(item.dueAt)}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </div>

        <Card
          style={{
            backgroundColor: isMobile ? undefined : 'var(--surface-800)',
            border: isMobile ? undefined : '1px solid var(--surface-700)',
          }}
          title={<span style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)' }}>AI 写作风格分析（真实接口）</span>}
        >
          <div className={isMobile ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-2 gap-8'}>
            <div className="flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-72 h-72">
                <defs>
                  <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--primary-500)" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="var(--primary-700)" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                {[20, 40, 60, 80].map((r) => (
                  <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="var(--surface-700)" strokeWidth="1" />
                ))}
                {RADAR_AXES.map((label, i) => {
                  const angle = (i * 60 - 90) * (Math.PI / 180);
                  const x = 100 + 80 * Math.cos(angle);
                  const y = 100 + 80 * Math.sin(angle);
                  const lx = 100 + 95 * Math.cos(angle);
                  const ly = 100 + 95 * Math.sin(angle);
                  return (
                    <g key={label}>
                      <line x1="100" y1="100" x2={x} y2={y} stroke="var(--surface-700)" strokeWidth="1" />
                      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="var(--text-muted)">
                        {label}
                      </text>
                    </g>
                  );
                })}
                <polygon
                  points={RADAR_AXES.map((_, i) => {
                    const angle = (i * 60 - 90) * (Math.PI / 180);
                    const r = (radarValues[i] / 100) * 80;
                    const x = 100 + r * Math.cos(angle);
                    const y = 100 + r * Math.sin(angle);
                    return `${x},${y}`;
                  }).join(' ')}
                  fill="url(#radarGrad)"
                  stroke="var(--primary-500)"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 content-center">
              {RADAR_AXES.map((axis, idx) => (
                <Statistic
                  key={axis}
                  title={<span style={{ color: 'var(--text-muted)' }}>{axis}</span>}
                  value={radarValues[idx]}
                  suffix="%"
                  valueStyle={{ color: 'var(--primary-300)' }}
                />
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        title="新建知识库"
        open={showCreateKbModal}
        onOk={() => void handleCreateKnowledgeBase()}
        confirmLoading={creatingKb}
        onCancel={() => setShowCreateKbModal(false)}
      >
        <Input
          value={newKbName}
          onChange={(event) => setNewKbName(event.target.value)}
          placeholder="请输入知识库名称"
          maxLength={128}
        />
      </Modal>
    </div>
  );
}

export default LearningHubPage;
