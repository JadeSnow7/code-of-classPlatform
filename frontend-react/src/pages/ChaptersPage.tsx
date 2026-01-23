import { useState, useEffect } from 'react';
import { useCourse } from '@/domains/course/useCourse';
import { chapterApi, type Chapter } from '@/api/chapter';
import { ChapterList } from '@/domains/chapter/ChapterList';
import { Loader2, BookOpen } from 'lucide-react';

export function ChaptersPage() {
    const { course } = useCourse();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (course?.ID) {
            loadChapters();
        }
    }, [course?.ID]);

    const loadChapters = async () => {
        if (!course?.ID) return;
        try {
            const data = await chapterApi.list(course.ID);
            setChapters(data);
        } catch (err) {
            console.error('Failed to load chapters:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-blue-500" />
                        章节学习
                    </h1>
                    <p className="text-gray-400 mt-1">
                        系统化学习课程知识点，实时追踪学习进度
                    </p>
                </div>
                {/* {isTeacher && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        添加章节
                    </button>
                )} */}
            </div>

            {/* List */}
            <ChapterList chapters={chapters} courseId={course!.ID} />
        </div>
    );
}
