import { useState, useEffect, useCallback } from 'react';
import { useCourse } from '@/domains/course/useCourse';
import { announcementApi, type Announcement } from '@/api/announcement';
import { Plus, Trash2, Megaphone } from 'lucide-react';
import { useAuth } from '@/domains/auth/useAuth';
import { logger } from '@/lib/logger';

export function AnnouncementsPage() {
    const { course } = useCourse();
    const { user } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');

    const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
    const canManage = isTeacher && course?.teacher_id === Number(user?.id);

    const loadAnnouncements = useCallback(async () => {
        const courseId = course?.ID;
        if (!courseId) {
            setLoading(false);
            return;
        }
        try {
            const data = await announcementApi.list(courseId);
            setAnnouncements(data);
        } catch (error) {
            logger.error('failed to load announcements', { error, courseId });
        } finally {
            setLoading(false);
        }
    }, [course?.ID]);

    useEffect(() => {
        setLoading(true);
        loadAnnouncements();
    }, [loadAnnouncements]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!course) return;

        try {
            await announcementApi.create(course.ID, {
                title: newTitle,
                content: newContent,
            });
            setIsCreating(false);
            setNewTitle('');
            setNewContent('');
            await loadAnnouncements();
        } catch (error) {
            logger.error('failed to create announcement', { error, courseId: course?.ID });
            alert('Failed to create announcement');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this announcement?')) return;
        try {
            await announcementApi.delete(id);
            await loadAnnouncements();
        } catch (error) {
            logger.error('failed to delete announcement', { error, id });
        }
    };

    const handleMarkRead = async (id: number, isRead: boolean) => {
        if (isRead) return;
        try {
            await announcementApi.markRead(id);
            // Optimistically update
            setAnnouncements(prev => prev.map(a =>
                a.id === id ? { ...a, is_read: true } : a
            ));
        } catch (error) {
            logger.error('failed to mark announcement read', { error, id });
        }
    };

    if (loading) return <div className="p-6 text-gray-400">Loading announcements...</div>;

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Megaphone className="w-6 h-6 text-blue-400" />
                    课程公告
                </h1>
                {canManage && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        发布公告
                    </button>
                )}
            </div>

            {isCreating && (
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 animate-in fade-in slide-in-from-top-4">
                    <h2 className="text-lg font-semibold text-white mb-4">新公告</h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">标题</label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">内容</label>
                            <textarea
                                value={newContent}
                                onChange={e => setNewContent(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white h-32 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsCreating(false)}
                                className="text-gray-400 hover:text-white px-4 py-2"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                            >
                                发布
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="space-y-4">
                {announcements.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
                        暂无公告
                    </div>
                ) : (
                    announcements.map(announcement => (
                        <div
                            key={announcement.id}
                            className={`bg-gray-800 rounded-xl p-6 border transition-colors ${announcement.is_read ? 'border-gray-700 opacity-80' : 'border-blue-500/50 hover:border-blue-500'
                                }`}
                            onClick={() => !canManage && handleMarkRead(announcement.id, announcement.is_read)}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-3">
                                    {!announcement.is_read && (
                                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                    )}
                                    <h3 className={`text-lg font-semibold ${announcement.is_read ? 'text-gray-300' : 'text-white'}`}>
                                        {announcement.title}
                                    </h3>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-500">
                                        {new Date(announcement.created_at).toLocaleDateString()}
                                    </span>
                                    {canManage && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(announcement.id);
                                            }}
                                            className="text-gray-500 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="text-gray-400 whitespace-pre-wrap pl-5">
                                {announcement.content}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
