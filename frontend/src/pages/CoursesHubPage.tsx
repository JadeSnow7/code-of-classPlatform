import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Spin, Tag, Typography } from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import { BookOpen } from 'lucide-react';
import { useMobile } from '@/hooks/useMobile';
import { courseApi, type Course } from '@/api/course';

const { Title, Text } = Typography;

const GRADIENT_COLORS = [
    'from-sky-500 to-blue-700',
    'from-indigo-500 to-violet-700',
    'from-emerald-500 to-teal-700',
    'from-orange-500 to-amber-600',
];

type CourseCardModel = {
    id: number;
    name: string;
    teacherName: string;
    teacherId: number;
    code?: string;
    semester?: string;
    studentCount?: number;
};

function normalizeCourseList(payload: unknown): Course[] {
    if (Array.isArray(payload)) {
        return payload as Course[];
    }

    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const directCandidates = [record.data, record.items, record.courses];
        for (const candidate of directCandidates) {
            if (Array.isArray(candidate)) {
                return candidate as Course[];
            }
        }

        if (record.data && typeof record.data === 'object') {
            const nested = record.data as Record<string, unknown>;
            const nestedCandidates = [nested.items, nested.courses];
            for (const candidate of nestedCandidates) {
                if (Array.isArray(candidate)) {
                    return candidate as Course[];
                }
            }
        }
    }

    return [];
}

function toCourseModel(course: Course, index: number): CourseCardModel {
    const courseId = course.ID ?? course.id ?? index + 1;
    return {
        id: courseId,
        name: course.name,
        teacherName: course.teacher_name ?? '--',
        teacherId: course.teacher_id,
        code: course.code,
        semester: course.semester,
        studentCount: course.student_count,
    };
}

function EmptyCoursesState() {
    return (
        <div className="flex min-h-[58vh] items-center justify-center px-6">
            <div className="max-w-md text-center">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[30px] bg-slate-100/90 text-slate-300 shadow-inner dark:bg-slate-800/70 dark:text-slate-600">
                    <BookOpen size={40} strokeWidth={1.6} />
                </div>
                <Title level={3} className="!mb-2 !mt-6 !text-slate-900 dark:!text-slate-100">
                    暂无课程
                </Title>
                <Text className="text-sm leading-7 text-slate-500 dark:text-slate-400">
                    当前账号下还没有可进入的课程空间。课程创建或加入后，这里会自动出现。
                </Text>
            </div>
        </div>
    );
}

export function CoursesHubPage() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const isMobile = useMobile();

    useEffect(() => {
        (courseApi.list() as Promise<unknown>)
            .then((payload) => setCourses(normalizeCourseList(payload)))
            .catch(() => setCourses([]))
            .finally(() => setLoading(false));
    }, []);

    const models = useMemo(() => courses.map(toCourseModel), [courses]);

    if (loading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center px-6">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="h-full bg-transparent px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto max-w-[1600px]">
                <div className="mb-8">
                    <Title level={2} className="!mb-2 !text-slate-900 dark:!text-slate-100">
                        我的课程
                    </Title>
                    <Text className="text-sm text-slate-500 dark:text-slate-400">
                        课程空间、教师信息与学期标识会在这里集中呈现。
                    </Text>
                </div>

                {models.length === 0 ? (
                    <EmptyCoursesState />
                ) : (
                    <div
                        className={
                            isMobile
                                ? 'space-y-4'
                                : 'grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3'
                        }
                    >
                        {models.map((course, idx) => (
                            <button
                                key={course.id}
                                type="button"
                                onClick={() => navigate(`/courses/${course.id}/overview`)}
                                className="group w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white text-left shadow-[0_18px_48px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(15,23,42,0.10)] dark:border-slate-700 dark:bg-slate-800/80 dark:shadow-[0_18px_48px_rgba(2,6,23,0.24)]"
                            >
                                <div
                                    className={`h-28 bg-gradient-to-br ${GRADIENT_COLORS[idx % GRADIENT_COLORS.length]} px-6 pb-4 pt-5`}
                                >
                                    <div className="inline-flex rounded-full bg-white/18 px-3 py-1 text-xs font-medium text-white/92 backdrop-blur">
                                        课程空间
                                    </div>
                                    <h3 className="mt-5 text-xl font-semibold tracking-tight text-white">{course.name}</h3>
                                </div>

                                <div className="space-y-4 p-6">
                                    <div className="flex items-center gap-3">
                                        <Avatar
                                            size={48}
                                            icon={<UserOutlined />}
                                            style={{ background: `hsl(${(idx * 61) % 360}, 70%, 55%)`, flexShrink: 0 }}
                                        />
                                        <div className="min-w-0">
                                            <Text strong className="block truncate text-base text-slate-900 dark:text-slate-100">
                                                {course.teacherName}
                                            </Text>
                                            <Text className="text-sm text-slate-500 dark:text-slate-400">
                                                教师 ID: {course.teacherId}
                                            </Text>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Tag className="!rounded-full !px-3 !py-1 !text-xs">{course.code ?? '课程编码待定'}</Tag>
                                        <Tag className="!rounded-full !px-3 !py-1 !text-xs">{course.semester ?? '学期待定'}</Tag>
                                        <Tag className="!rounded-full !px-3 !py-1 !text-xs" icon={<TeamOutlined />}>
                                            {course.studentCount ?? '--'}
                                        </Tag>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 text-sm text-slate-500 dark:text-slate-400">
                                        <span>进入课程总览</span>
                                        <span className="translate-x-0 transition-transform group-hover:translate-x-1">
                                            查看详情
                                        </span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
