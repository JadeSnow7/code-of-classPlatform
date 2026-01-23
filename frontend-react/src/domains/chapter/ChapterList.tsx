import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { Chapter } from '@/api/chapter';

interface ChapterListProps {
    chapters: Chapter[];
    courseId: number | string;
}

export function ChapterList({ chapters, courseId }: ChapterListProps) {
    if (chapters.length === 0) {
        return (
            <div className="text-center py-12 bg-gray-800/30 rounded-2xl border border-gray-700 border-dashed">
                <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-400">暂无章节</h3>
                <p className="text-sm text-gray-500 mt-1">等待教师发布内容</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {chapters.map((chapter, index) => (
                <Link
                    key={chapter.ID}
                    to={`/courses/${courseId}/chapters/${chapter.ID}`}
                    className="block group"
                >
                    <div className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-blue-500/50 rounded-xl p-5 transition-all duration-300">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 text-sm font-bold">
                                        {index + 1}
                                    </span>
                                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                                        {chapter.title}
                                    </h3>
                                </div>
                                <p className="text-gray-400 text-sm line-clamp-2 pl-11">
                                    {chapter.summary || '暂无简介'}
                                </p>
                            </div>
                            <div className="flex items-center text-gray-500 group-hover:text-blue-400 transition-colors self-center">
                                <ChevronRight className="w-6 h-6" />
                            </div>
                        </div>

                        {/* Knowledge Points Preview */}
                        {chapter.knowledge_points && (
                            <div className="mt-4 pl-11 flex flex-wrap gap-2">
                                {(() => {
                                    try {
                                        const points = JSON.parse(chapter.knowledge_points);
                                        if (Array.isArray(points)) {
                                            return points.slice(0, 3).map((point: string, i: number) => (
                                                <span key={i} className="px-2 py-1 rounded bg-gray-700/50 text-xs text-gray-300 border border-gray-600/50">
                                                    {point}
                                                </span>
                                            ));
                                        }
                                    } catch (e) {
                                        return null;
                                    }
                                })()}
                            </div>
                        )}
                    </div>
                </Link>
            ))}
        </div>
    );
}
