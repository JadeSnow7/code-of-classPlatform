import { useState, useEffect } from 'react';
import { useCourse } from '@/domains/course/useCourse';
import { useAuth } from '@/domains/auth/useAuth';
import { attendanceApi, type AttendanceSummary, type SessionListItem, type AttendanceRecord } from '@/api/attendance';
import { Users, Clock, QrCode, CheckCircle } from 'lucide-react';
import { logger } from '@/lib/logger';

export function AttendancePage() {
    const { course } = useCourse();
    const { user } = useAuth();
    const [summary, setSummary] = useState<AttendanceSummary | null>(null);
    const [sessions, setSessions] = useState<SessionListItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Teacher state
    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [timeoutMinutes, setTimeoutMinutes] = useState(15);

    // Student state
    const [checkinCode, setCheckinCode] = useState('');
    const [checkinStatus, setCheckinStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [checkinMessage, setCheckinMessage] = useState('');

    const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
    const canManage = isTeacher && course?.teacher_id === Number(user?.id);

    useEffect(() => {
        if (course?.ID) {
            refreshData();
        }
    }, [course?.ID]);

    useEffect(() => {
        if (selectedSessionId && canManage) {
            loadRecords(selectedSessionId);
        }
    }, [selectedSessionId]);

    const refreshData = async () => {
        setLoading(true);
        try {
            const [summaryData, sessionsData] = await Promise.all([
                attendanceApi.getSummary(course!.ID),
                attendanceApi.listSessions(course!.ID)
            ]);
            setSummary(summaryData);
            setSessions(sessionsData);
        } catch (error) {
            logger.error('failed to load attendance data', { error, courseId: course?.ID });
        } finally {
            setLoading(false);
        }
    };

    const loadRecords = async (sessionId: number) => {
        try {
            const data = await attendanceApi.getRecords(sessionId);
            setRecords(data);
        } catch (error) {
            logger.error('failed to load attendance records', { error, sessionId });
        }
    };

    const handleStartSession = async () => {
        try {
            await attendanceApi.startSession(course!.ID, timeoutMinutes);
            refreshData();
        } catch (error) {
            alert('Failed to start session');
        }
    };

    const handleEndSession = async (sessionId: number) => {
        try {
            await attendanceApi.endSession(sessionId);
            refreshData();
        } catch (error) {
            alert('Failed to end session');
        }
    };

    const handleCheckin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary?.active_session) return;

        try {
            await attendanceApi.checkin(summary.active_session.id, checkinCode);
            setCheckinStatus('success');
            setCheckinMessage('签到成功！');
            refreshData();
        } catch (error) {
            setCheckinStatus('error');
            setCheckinMessage('签到失败，请检查验证码');
        }
    };

    if (loading) return <div className="p-6 text-gray-400">Loading attendance...</div>;

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Users className="w-6 h-6 text-purple-400" />
                考勤管理
            </h1>

            {/* Teacher View */}
            {canManage ? (
                <div className="space-y-6">
                    {/* Active Session Control */}
                    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                        <h2 className="text-lg font-semibold text-white mb-4">当前状态</h2>
                        {summary?.active_session ? (
                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-green-900/20 border border-green-500/30 rounded-lg p-6">
                                <div>
                                    <div className="text-green-400 font-bold text-xl flex items-center gap-2">
                                        <Clock className="w-5 h-5 animate-pulse" />
                                        签到进行中
                                    </div>
                                    <div className="text-4xl font-mono text-white mt-2 tracking-widest">{summary.active_session.code}</div>
                                    <div className="text-sm text-gray-400 mt-1">自动结束时间: {new Date(summary.active_session.ends_at).toLocaleTimeString()}</div>
                                </div>
                                <button
                                    onClick={() => handleEndSession(summary.active_session!.id)}
                                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                                >
                                    结束签到
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-400">持续时间(分钟):</span>
                                    <input
                                        type="number"
                                        value={timeoutMinutes}
                                        onChange={e => setTimeoutMinutes(parseInt(e.target.value))}
                                        className="bg-gray-900 border border-gray-700 rounded px-3 py-1 text-white w-20"
                                        min="1"
                                        max="60"
                                    />
                                </div>
                                <button
                                    onClick={handleStartSession}
                                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                >
                                    发起签到
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Records Review */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Session List */}
                        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 h-96 overflow-y-auto">
                            <h3 className="text-gray-400 font-medium mb-3">历史场次</h3>
                            <div className="space-y-2">
                                {sessions.map(session => (
                                    <div
                                        key={session.id}
                                        onClick={() => setSelectedSessionId(session.id)}
                                        className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedSessionId === session.id
                                            ? 'bg-purple-900/30 border border-purple-500/50'
                                            : 'bg-gray-900/50 hover:bg-gray-900'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="text-white font-medium">
                                                {new Date(session.start_at).toLocaleDateString()}
                                            </span>
                                            <span className="text-sm text-gray-400">
                                                {session.attendee_count}人
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {new Date(session.start_at).toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Records Detail */}
                        <div className="md:col-span-2 bg-gray-800 rounded-xl p-4 border border-gray-700 h-96 overflow-y-auto">
                            <h3 className="text-gray-400 font-medium mb-3">
                                {selectedSessionId ? '签到记录' : '请选择场次查看详情'}
                            </h3>
                            {selectedSessionId && (
                                <table className="w-full text-left">
                                    <thead className="text-gray-500 text-sm border-b border-gray-700">
                                        <tr>
                                            <th className="pb-2">姓名</th>
                                            <th className="pb-2">签到时间</th>
                                            <th className="pb-2">IP</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-300">
                                        {records.map(record => (
                                            <tr key={record.student_id} className="border-b border-gray-800 last:border-0 hover:bg-gray-700/30">
                                                <td className="py-2">{record.student_name}</td>
                                                <td className="py-2">{new Date(record.checked_in_at).toLocaleTimeString()}</td>
                                                <td className="py-2 text-gray-500 text-sm">{record.ip_address}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* Student View */
                <div className="max-w-md mx-auto mt-10">
                    <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
                        <div className="w-20 h-20 bg-purple-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <QrCode className="w-10 h-10 text-purple-400" />
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-2">课堂签到</h2>

                        {summary?.active_session ? (
                            checkinStatus === 'success' ? (
                                <div className="text-green-400 flex flex-col items-center animate-in zoom-in">
                                    <CheckCircle className="w-16 h-16 mb-4" />
                                    <p className="text-lg">签到成功</p>
                                </div>
                            ) : (
                                <form onSubmit={handleCheckin} className="space-y-4">
                                    <p className="text-gray-400 mb-6">请输入老师公布的6位数字签到码</p>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={checkinCode}
                                        onChange={e => setCheckinCode(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-center text-3xl font-mono text-white tracking-[1em] focus:ring-2 focus:ring-purple-500 outline-none"
                                        placeholder="000000"
                                    />
                                    {checkinStatus === 'error' && (
                                        <p className="text-red-400 text-sm">{checkinMessage}</p>
                                    )}
                                    <button
                                        type="submit"
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition-transform active:scale-95"
                                    >
                                        立即签到
                                    </button>
                                </form>
                            )
                        ) : (
                            <div className="text-gray-500 py-8">
                                <p>当前没有正在进行的签到</p>
                            </div>
                        )}

                        <div className="mt-8 border-t border-gray-700 pt-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">累计签到</span>
                                <span className="text-white font-bold">{summary?.sessions_count ? Math.round(summary.attendance_rate * 100) : 0}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
