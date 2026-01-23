import { useCourse } from '@/domains/course/useCourse';
import { Megaphone, Calendar, Users } from 'lucide-react';

export function OverviewPage() {
    const { course } = useCourse();

    return (
        <div className="p-6 space-y-6">
            {/* Hero */}
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl p-8 border border-blue-500/20">
                <h1 className="text-3xl font-bold text-white mb-2">{course?.name}</h1>
                <p className="text-gray-300">暂无描述</p>
                <div className="flex items-center gap-2 mt-4 text-gray-400">
                    <Users className="w-4 h-4" />
                    <span>授课教师ID: {course?.teacher_id}</span>
                </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                            <Megaphone className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-gray-300 font-medium">公告</span>
                    </div>
                    <p className="text-2xl font-bold text-white">3</p>
                    <p className="text-sm text-gray-500">条未读公告</p>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-green-400" />
                        </div>
                        <span className="text-gray-300 font-medium">作业</span>
                    </div>
                    <p className="text-2xl font-bold text-white">2</p>
                    <p className="text-sm text-gray-500">项待提交</p>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                            <Users className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="text-gray-300 font-medium">签到</span>
                    </div>
                    <p className="text-2xl font-bold text-white">95%</p>
                    <p className="text-sm text-gray-500">出勤率</p>
                </div>
            </div>
        </div>
    );
}
