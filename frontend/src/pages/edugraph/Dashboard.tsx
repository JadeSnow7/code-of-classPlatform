import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { 
  TrendingUp, Flame, BookOpen, FileText, Upload, ChevronRight,
  AlertCircle, CheckCircle2, Clock, Zap, Network
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { KnowledgeNodePill } from '@/components/edugraph/KnowledgeNodePill';
import { StatusBadge } from '@/components/edugraph/StatusBadge';
import { SectionSkeleton } from '@/components/edugraph/SkeletonLoader';
import { useAuth } from '@/domains/auth/useAuth';
import { courseApi } from '@/api/course';
import { assignmentApi } from '@/api/assignment';

// ─── Mock KG path data ────────────────────────────────────────────────────────
const MOCK_LEARNING_PATH = [
  { id: '1', label: '向量空间', mastery: 100, status: 'mastered' as const },
  { id: '2', label: '矩阵运算', mastery: 82, status: 'mastered' as const },
  { id: '3', label: '行列式', mastery: 55, status: 'in_progress' as const },
  { id: '4', label: '特征值', mastery: 0, status: 'recommended' as const },
  { id: '5', label: 'SVD 分解', mastery: 0, status: 'not_started' as const },
];

const MOCK_RADAR_DATA = [
  { subject: '逻辑性', score: 82, avg: 70, fullMark: 100 },
  { subject: '结构', score: 74, avg: 65, fullMark: 100 },
  { subject: '深度', score: 68, avg: 72, fullMark: 100 },
  { subject: '引用', score: 55, avg: 60, fullMark: 100 },
  { subject: '语言', score: 90, avg: 78, fullMark: 100 },
  { subject: '原创性', score: 77, avg: 68, fullMark: 100 },
];

const MOCK_HEATMAP = Array.from({ length: 35 }, (_, i) => ({
  id: i,
  concept: ['向量', '矩阵', '行列式', '子空间', '基', '维数', '秩'][Math.floor(Math.random() * 7)],
  mastery: Math.floor(Math.random() * 100),
}));

// ─── Learning Path Component ──────────────────────────────────────────────────
const LearningPath: React.FC = () => {
  const mastery2Style = (status: string) => {
    if (status === 'mastered') return 'bg-purple-500 text-white border-purple-500';
    if (status === 'in_progress') return 'bg-blue-500 text-white border-blue-500';
    if (status === 'recommended') return 'ring-2 ring-amber-400 ring-offset-2 bg-amber-50 border-amber-300 text-amber-800';
    return 'bg-white border-slate-300 text-slate-400';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Network className="w-4 h-4 text-blue-500" /> 学习路径
        </h3>
        <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          查看全图 <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {MOCK_LEARNING_PATH.map((node, i) => (
          <React.Fragment key={node.id}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5"
            >
              <div className={cn(
                'w-12 h-12 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all',
                mastery2Style(node.status),
                node.status === 'recommended' && 'animate-pulse'
              )}>
                {node.status === 'mastered' ? '✓' : node.mastery > 0 ? `${node.mastery}%` : '○'}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center max-w-[56px] leading-tight">
                {node.label}
              </p>
            </motion.div>
            {i < MOCK_LEARNING_PATH.length - 1 && (
              <div className="w-8 h-0.5 bg-slate-200 dark:bg-slate-700 flex-shrink-0 mt-[-12px]" />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
          <Zap className="w-3 h-3" /> 建议下一步：掌握「特征值」— 是 SVD 分解的前置概念
        </p>
      </div>
    </div>
  );
};

// ─── Mastery Heatmap ──────────────────────────────────────────────────────────
const MasteryHeatmap: React.FC = () => {
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);

  const getMasteryColor = (m: number) => {
    if (m >= 80) return 'bg-purple-500';
    if (m >= 60) return 'bg-blue-400';
    if (m >= 30) return 'bg-blue-200';
    if (m > 0) return 'bg-slate-200';
    return 'bg-slate-100';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-purple-500" /> 概念掌握热图
      </h3>
      <div className="grid grid-cols-7 gap-1.5">
        {MOCK_HEATMAP.map((cell) => (
          <div
            key={cell.id}
            onMouseEnter={() => setHoveredCell(cell.id)}
            onMouseLeave={() => setHoveredCell(null)}
            className={cn(
              'aspect-square rounded-md cursor-pointer transition-all duration-200 relative',
              getMasteryColor(cell.mastery),
              hoveredCell === cell.id && 'scale-125 z-10 shadow-md'
            )}
            title={`${cell.concept}: ${cell.mastery}%`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-400">
        <span>未开始</span>
        <div className="flex gap-0.5">
          {['bg-slate-100', 'bg-blue-200', 'bg-blue-400', 'bg-purple-500'].map((c, i) => (
            <div key={i} className={cn('w-3 h-3 rounded-sm', c)} />
          ))}
        </div>
        <span>已掌握</span>
      </div>
    </div>
  );
};

// ─── Weekly Activity Chart ────────────────────────────────────────────────────
const WeeklyActivity: React.FC<{ data: any[] }> = ({ data }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-500" /> 本周学习
      </h3>
      <div className="flex items-center gap-1 text-sm text-orange-500 font-bold">
        <Flame className="w-4 h-4" /> 7天
      </div>
    </div>
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={18}>
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
            itemStyle={{ color: '#60a5fa' }}
            formatter={(v: any) => [`${v} min`, '学习时长']}
          />
          <Bar dataKey="minutes" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-3 text-center">
      <div><p className="text-lg font-bold text-slate-800 dark:text-slate-100">12</p><p className="text-[10px] text-slate-400">本周概念</p></div>
      <div><p className="text-lg font-bold text-slate-800 dark:text-slate-100">3.2h</p><p className="text-[10px] text-slate-400">总时长</p></div>
      <div><p className="text-lg font-bold text-green-600">↑12%</p><p className="text-[10px] text-slate-400">环比</p></div>
    </div>
  </div>
);

// ─── AI Writing Radar ────────────────────────────────────────────────────────
const WritingRadar: React.FC = () => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
      <FileText className="w-4 h-4 text-purple-500" /> 写作能力雷达
    </h3>
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={MOCK_RADAR_DATA}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="班级均值" dataKey="avg" stroke="#cbd5e1" fill="#cbd5e1" fillOpacity={0.3} strokeWidth={1.5} strokeDasharray="4 2" />
          <Radar name="我的得分" dataKey="score" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.25} strokeWidth={2} />
          <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// ─── Assignments Panel ────────────────────────────────────────────────────────
const AssignmentsPanel: React.FC<{ assignments: any[]; loading: boolean }> = ({ assignments, loading }) => {
  if (loading) return <SectionSkeleton rows={2} />;

  const mockAssignments = assignments.length > 0 ? assignments : [
    { id: '1', title: '矩阵分解练习', courseName: 'MATH201', status: 'published', deadline: '2026-03-25', concepts: ['LU分解', 'QR分解', 'SVD'], submission: null },
    { id: '2', title: '向量空间小测', courseName: 'MATH201', status: 'closed', deadline: '2026-03-18', concepts: ['向量空间', '基', '维数'], submission: { status: 'graded', score: 92 } },
  ];

  const isOverdue = (deadline: string) => new Date(deadline) < new Date();

  return (
    <div className="space-y-3">
      {mockAssignments.slice(0, 3).map((a) => (
        <div key={a.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium border border-blue-100">
                {a.courseName}
              </span>
              <StatusBadge type="assignment" status={a.status} />
              {isOverdue(a.deadline) && !a.submission && (
                <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-100">逾期</span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
              <Clock className="w-3 h-3" /> {a.deadline}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-2">{a.title}</p>
          <div className="flex flex-wrap gap-1 mb-3">
            {a.concepts.map((c: string) => (
              <KnowledgeNodePill key={c} concept={c} mastery="in_progress" size="sm" />
            ))}
          </div>
          <div className="flex items-center justify-between">
            {a.submission ? (
              <StatusBadge type="submission" status={a.submission.status} score={a.submission.score} />
            ) : (
              <span className="text-xs text-slate-400 flex items-center gap-1">○ 未提交</span>
            )}
            <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {a.submission ? '查看反馈' : '打开'} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Knowledge Base Manager ─────────────────────────────────────────────────
const KnowledgeBaseManager: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);

  const mockFiles = [
    { name: '线性代数笔记.pdf', size: '12MB', status: 'completed', concepts: ['向量', '矩阵', '行列式'] },
    { name: '信号处理课件.pptx', size: '8MB', status: 'processing', concepts: [] },
    { name: '微积分教材.pdf', size: '45MB', status: 'pending', concepts: [] },
  ];

  const statusIcon = (s: string) => s === 'completed' ? '✅' : s === 'processing' ? '⏳' : '🕐';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-green-500" /> 知识库
      </h3>
      <div className="space-y-2 mb-3">
        {mockFiles.map((f) => (
          <div key={f.name} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">{statusIcon(f.status)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-slate-700 dark:text-slate-300 font-medium truncate">{f.name}</p>
              <p className="text-slate-400">{f.size}</p>
              {f.concepts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {f.concepts.map(c => <KnowledgeNodePill key={c} concept={c} mastery="mastered" size="sm" />)}
                </div>
              )}
              {f.status === 'processing' && (
                <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full animate-[shimmer_1.8s_linear_infinite] w-2/3" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
        className={cn(
          'border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer',
          isDragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
        )}
      >
        <Upload className="w-4 h-4 text-slate-400 mx-auto mb-1" />
        <p className="text-xs text-slate-400">拖拽文件至此或点击上传</p>
        <p className="text-[10px] text-slate-300 mt-0.5">PDF, DOCX, PPTX · 最大 50MB</p>
      </div>
    </div>
  );
};

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const activityData = useMemo(() => {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return days.map((day, i) => ({
      day,
      minutes: [45, 90, 30, 120, 75, 160, 55][i],
    }));
  }, []);

  const assignmentsQuery = useQuery({
    queryKey: ['edugraph-dashboard-assignments'],
    queryFn: async () => {
      const coursesPayload = await courseApi.listMy({ page: 1, pageSize: 3, sortBy: 'updated_at', sortOrder: 'desc' });
      const courseAssignments = await Promise.all(
        coursesPayload.items.slice(0, 3).map(async (course) => {
          const payload = await assignmentApi.listCourseAssignments(course.id, {
            page: 1,
            pageSize: 5,
            sortBy: 'deadline',
            sortOrder: 'asc',
          });
          return payload.items.map((assignment: any) => ({
            ...assignment,
            courseName: course.name,
          }));
        })
      );
      return courseAssignments.flat().slice(0, 5);
    },
  });

  const assignments = assignmentsQuery.data ?? [];
  const loading = assignmentsQuery.isLoading;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {greeting}，{user?.name || '同学'} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">今天是你连续学习的第 <span className="text-orange-500 font-bold">7</span> 天</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-green-500" /> 本周已完成 12 个概念
        </div>
      </motion.div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: 60% */}
        <div className="lg:col-span-3 space-y-5">
          <LearningPath />
          <MasteryHeatmap />

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-orange-500" /> 待完成作业
            </h3>
            <AssignmentsPanel assignments={assignments} loading={loading} />
          </div>
        </div>

        {/* Right: 40% */}
        <div className="lg:col-span-2 space-y-4">
          <WeeklyActivity data={activityData} />
          <WritingRadar />
          <KnowledgeBaseManager />
        </div>
      </div>
    </div>
  );
};
