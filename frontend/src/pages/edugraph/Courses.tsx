import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Search, Plus, ChevronRight, Users, GraduationCap, Network, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { courseApi } from '@/api/course';
import { EmptyState } from '@/components/edugraph/SkeletonLoader';
import { useNavigate } from 'react-router-dom';

// ─── Mock data (shown if API returns empty) ────────────────────────────────────
type EduGraphCourseCardModel = {
  id: string;
  name: string;
  code: string;
  semester: string;
  teacherName: string;
  role: string;
  progress: number;
  enrolledCount: number;
  kgCount: number;
  cover: string;
};

const MOCK_COURSES: EduGraphCourseCardModel[] = [
  { id: '1', name: '线性代数与应用', code: 'MATH201', semester: '2026春季', teacherName: '张教授', role: 'student', progress: 65, enrolledCount: 42, kgCount: 47, cover: 'https://picsum.photos/seed/math201/400/200' },
  { id: '2', name: '高等微积分', code: 'MATH101', semester: '2026春季', teacherName: '李教授', role: 'student', progress: 80, enrolledCount: 68, kgCount: 62, cover: 'https://picsum.photos/seed/math101/400/200' },
  { id: '3', name: '人工智能基础', code: 'CS301', semester: '2026春季', teacherName: '王教授', role: 'teacher', progress: 0, enrolledCount: 55, kgCount: 93, cover: 'https://picsum.photos/seed/cs301/400/200' },
  { id: '4', name: '数据结构与算法', code: 'CS201', semester: '2025秋季', teacherName: '陈教授', role: 'student', progress: 100, enrolledCount: 38, kgCount: 71, cover: 'https://picsum.photos/seed/cs201/400/200' },
  { id: '5', name: '概率论与统计学', code: 'MATH301', semester: '2025秋季', teacherName: '张教授', role: 'student', progress: 45, enrolledCount: 29, kgCount: 55, cover: 'https://picsum.photos/seed/stat/400/200' },
  { id: '6', name: '计算机网络', code: 'CS401', semester: '2026春季', teacherName: '刘教授', role: 'student', progress: 22, enrolledCount: 31, kgCount: 40, cover: 'https://picsum.photos/seed/net/400/200' },
];

// ─── Course Card ───────────────────────────────────────────────────────────────
const CourseCard: React.FC<{ course: EduGraphCourseCardModel; onOpen: () => void }> = ({ course, onOpen }) => {
  const isTeacher = course.role === 'teacher';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-all duration-200 group cursor-pointer"
      onClick={onOpen}
    >
      {/* Cover */}
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600">
        <img src={course.cover} alt={course.name} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        {/* Role badge */}
        <div className="absolute top-3 right-3">
          {isTeacher ? (
            <span className="px-2 py-0.5 bg-purple-600/90 text-white text-[10px] font-bold rounded-full">教师</span>
          ) : (
            <span className="px-2 py-0.5 bg-blue-600/90 text-white text-[10px] font-bold rounded-full">学生</span>
          )}
        </div>
        {/* Code */}
        <div className="absolute bottom-2 left-3 text-white text-[10px] font-mono bg-black/30 px-2 py-0.5 rounded-full">
          {course.code} · {course.semester}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight mb-0.5 group-hover:text-blue-600 transition-colors">
          {course.name}
        </h3>
        <p className="text-xs text-slate-400 mb-3">{course.teacherName}</p>

        {/* KG indicator */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
          <Network className="w-3 h-3 text-purple-400" />
          <span>{course.kgCount} 个概念已映射</span>
        </div>

        {/* Progress / Enrollment */}
        {isTeacher ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <Users className="w-3 h-3" />
            <span>{course.enrolledCount} 名学生已加入</span>
          </div>
        ) : (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>掌握进度</span>
              <span>{course.progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', course.progress >= 80 ? 'bg-purple-500' : course.progress >= 50 ? 'bg-blue-400' : 'bg-blue-300')}
                style={{ width: `${course.progress}%` }}
              />
            </div>
          </div>
        )}

        <button className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/20 py-2 rounded-xl hover:bg-blue-100 transition-colors">
          进入课程 <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
};

// ─── Courses Page ──────────────────────────────────────────────────────────────
export const Courses: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'mine' | 'all'>('mine');
  const [keyword, setKeyword] = useState('');
  const [semester, setSemester] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'name' | 'enrolledCount'>('updatedAt');
  const [page, setPage] = useState(1);

  const coursesQuery = useQuery({
    queryKey: ['edugraph-courses', activeTab, page, keyword, semester, sortBy],
    queryFn: async () => {
      const payload = activeTab === 'mine'
        ? await courseApi.listMy({ page, pageSize: 9, keyword, semester, sortBy, sortOrder: 'desc' })
        : await courseApi.listPublic({ page, pageSize: 9, keyword, semester, sortBy, sortOrder: 'desc' });
      if (payload.items.length === 0) {
        return [] as EduGraphCourseCardModel[];
      }
      return payload.items.map((course, index): EduGraphCourseCardModel => ({
        id: String(course.id),
        name: course.name,
        code: course.code || `COURSE${index + 1}`,
        semester: course.semester || '2026春季',
        teacherName: course.teacherName || '任课教师',
        role: course.role || 'student',
        progress: Math.floor(Math.random() * 100),
        enrolledCount: course.enrolledCount || 30,
        kgCount: 40 + index * 7,
        cover: `https://picsum.photos/seed/course-${course.id}/400/200`,
      }));
    },
  });

  const courses = useMemo(
    () => {
      if (coursesQuery.isError) {
        return MOCK_COURSES;
      }
      return coursesQuery.data ?? [];
    },
    [coursesQuery.data, coursesQuery.isError]
  );
  const loading = coursesQuery.isLoading;
  const totalPages = Math.max(1, Math.ceil(courses.length / 9));

  const filtered = courses.filter(c => (!keyword || c.name.includes(keyword) || (c.code || '').includes(keyword)) && (!semester || c.semester === semester));

  const SEMESTERS = [...new Set(courses.map(c => c.semester).filter(Boolean))] as string[];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5">
        <div className="flex items-center max-w-[1200px] mx-auto">
          {[
            { key: 'mine', label: '我的课程', icon: GraduationCap },
            { key: 'all', label: '全部课程', icon: BookOpen },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-all',
                activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}

          {/* Teacher: New Course button */}
          <button className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-full transition-colors my-auto">
            <Plus className="w-3.5 h-3.5" /> 新建课程
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3 max-w-[1200px] mx-auto flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="搜索课程名称、编号..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={semester}
            onChange={e => setSemester(e.target.value)}
            className="text-sm bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 outline-none"
          >
            <option value="">全部学期</option>
            {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="text-sm bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 outline-none"
          >
            <option value="updatedAt">最近更新</option>
            <option value="name">名称 A-Z</option>
            <option value="enrolledCount">最多学生</option>
          </select>
          <span className="ml-auto text-xs text-slate-400">共 {filtered.length} 门课程</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 p-5">
        <div className="max-w-[1200px] mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="animate-pulse bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="h-36 bg-slate-200 dark:bg-slate-700" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                    <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded mt-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState variant="courses" title="没有找到课程" description="尝试调整搜索条件，或切换到「全部课程」探索更多内容。" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(course => (
                <CourseCard key={course.id} course={course} onOpen={() => navigate(`/courses/${course.id}`)} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between mt-8 text-sm">
              <span className="text-slate-400">第 {page} 页，共 {totalPages} 页</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-100 transition-colors">
                  ‹ 上一页
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn('w-8 h-8 rounded-lg text-sm', page === p ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600')}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-100 transition-colors">
                  下一页 ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
