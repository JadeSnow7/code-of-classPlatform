import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCode } from 'antd';
import { useCourse } from '@/domains/course/useCourse';
import { useAuth } from '@/domains/auth/useAuth';
import {
    attendanceApi,
    type AttendanceSummary,
    type SessionListItem,
    type AttendanceRecord,
} from '@/api/attendance';
import { isApiError } from '@/lib/api-client';
import { Users, Clock, QrCode, CheckCircle, MapPin, RefreshCcw, Copy } from 'lucide-react';
import { logger } from '@/lib/logger';

type GeoPoint = {
    latitude: number;
    longitude: number;
};

type GeoStatus = 'idle' | 'locating' | 'ready' | 'error';
type CheckinStatus = 'idle' | 'success' | 'error' | 'submitting';

function requestCurrentPosition(): Promise<GeoPoint> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('当前浏览器不支持定位'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        reject(new Error('定位权限已被拒绝'));
                        return;
                    case error.POSITION_UNAVAILABLE:
                        reject(new Error('无法获取当前位置'));
                        return;
                    case error.TIMEOUT:
                        reject(new Error('定位超时，请重试'));
                        return;
                    default:
                        reject(new Error('定位失败，请稍后重试'));
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    });
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (isApiError(error)) {
        return error.payload.error.message;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

function formatCoordinate(point?: GeoPoint | null): string {
    if (!point) return '--';
    return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const earthRadiusMeters = 6371000;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const latDelta = toRadians(lat2 - lat1);
    const lngDelta = toRadians(lng2 - lng1);
    const startLat = toRadians(lat1);
    const endLat = toRadians(lat2);
    const a =
        Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
        Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AttendancePage() {
    const { course } = useCourse();
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    const [summary, setSummary] = useState<AttendanceSummary | null>(null);
    const [sessions, setSessions] = useState<SessionListItem[]>([]);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState('');

    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
    const [timeoutMinutes, setTimeoutMinutes] = useState(15);
    const [radiusMeters, setRadiusMeters] = useState(100);
    const [teacherGeoStatus, setTeacherGeoStatus] = useState<GeoStatus>('idle');
    const [teacherGeoError, setTeacherGeoError] = useState('');
    const [teacherPoint, setTeacherPoint] = useState<GeoPoint | null>(null);
    const [teacherActionMessage, setTeacherActionMessage] = useState('');
    const [isStartingSession, setIsStartingSession] = useState(false);
    const [isCopyingLink, setIsCopyingLink] = useState(false);

    const [studentPoint, setStudentPoint] = useState<GeoPoint | null>(null);
    const [studentGeoStatus, setStudentGeoStatus] = useState<GeoStatus>('idle');
    const [studentGeoError, setStudentGeoError] = useState('');
    const [checkinCode, setCheckinCode] = useState('');
    const [checkinStatus, setCheckinStatus] = useState<CheckinStatus>('idle');
    const [checkinMessage, setCheckinMessage] = useState('');

    const requestedSessionId = Number(searchParams.get('session') || 0) || null;
    const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
    const canManage = isTeacher && course?.teacher_id === Number(user?.id);
    const activeSession = summary?.active_session ?? null;
    const invalidSessionLink = !canManage && !!requestedSessionId && (!activeSession || activeSession.id !== requestedSessionId);
    const studentTargetSession = !canManage && !invalidSessionLink ? activeSession : null;
    const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;

    useEffect(() => {
        let ignore = false;

        async function loadAttendanceData() {
            const courseId = course?.ID;
            if (!courseId) {
                if (!ignore) {
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            setPageError('');

            try {
                const [summaryData, sessionsData] = await Promise.all([
                    attendanceApi.getSummary(courseId),
                    attendanceApi.listSessions(courseId),
                ]);
                if (ignore) return;
                setSummary(summaryData);
                setSessions(sessionsData);
                setSelectedSessionId((current) => current ?? sessionsData[0]?.id ?? null);
            } catch (error) {
                logger.error('failed to load attendance data', { error, courseId });
                if (!ignore) {
                    setPageError(getErrorMessage(error, '加载考勤数据失败'));
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        void loadAttendanceData();
        return () => {
            ignore = true;
        };
    }, [course?.ID]);

    useEffect(() => {
        let ignore = false;

        async function loadAttendanceRecords() {
            if (!selectedSessionId || !canManage) return;
            try {
                const data = await attendanceApi.getRecords(selectedSessionId);
                if (!ignore) {
                    setRecords(data);
                }
            } catch (error) {
                logger.error('failed to load attendance records', { error, sessionId: selectedSessionId });
            }
        }

        void loadAttendanceRecords();
        return () => {
            ignore = true;
        };
    }, [selectedSessionId, canManage]);

    useEffect(() => {
        if (canManage || !studentTargetSession) return;
        if (studentGeoStatus === 'locating' || studentGeoStatus === 'ready') return;

        let mounted = true;
        setStudentGeoStatus('locating');
        setStudentGeoError('');

        requestCurrentPosition()
            .then((point) => {
                if (!mounted) return;
                setStudentPoint(point);
                setStudentGeoStatus('ready');
            })
            .catch((error: unknown) => {
                if (!mounted) return;
                setStudentGeoStatus('error');
                setStudentGeoError(getErrorMessage(error, '定位失败，请检查权限设置'));
            });

        return () => {
            mounted = false;
        };
    }, [canManage, studentGeoStatus, studentTargetSession]);

    async function refreshData() {
        const courseId = course?.ID;
        if (!courseId) return;
        try {
            const [summaryData, sessionsData] = await Promise.all([
                attendanceApi.getSummary(courseId),
                attendanceApi.listSessions(courseId),
            ]);
            setSummary(summaryData);
            setSessions(sessionsData);
            if (!selectedSessionId && sessionsData[0]) {
                setSelectedSessionId(sessionsData[0].id);
            }
        } catch (error) {
            logger.error('failed to refresh attendance data', { error, courseId });
            setPageError(getErrorMessage(error, '刷新考勤数据失败'));
        }
    }

    async function locateTeacher() {
        setTeacherGeoStatus('locating');
        setTeacherGeoError('');
        try {
            const point = await requestCurrentPosition();
            setTeacherPoint(point);
            setTeacherGeoStatus('ready');
            return point;
        } catch (error) {
            const message = getErrorMessage(error, '无法获取老师当前位置');
            setTeacherGeoStatus('error');
            setTeacherGeoError(message);
            throw error;
        }
    }

    async function handleStartSession() {
        if (!course?.ID) return;

        setIsStartingSession(true);
        setTeacherActionMessage('');
        try {
            const point = await locateTeacher();
            await attendanceApi.startSession(course.ID, {
                timeout_minutes: timeoutMinutes,
                location_required: true,
                center_latitude: point.latitude,
                center_longitude: point.longitude,
                radius_meters: radiusMeters,
            });
            setTeacherActionMessage('签到已发起，二维码和签到链接已更新。');
            await refreshData();
        } catch (error) {
            logger.error('failed to start attendance session', { error, courseId: course?.ID });
            setTeacherActionMessage(getErrorMessage(error, '发起签到失败'));
        } finally {
            setIsStartingSession(false);
        }
    }

    async function handleEndSession(sessionId: number) {
        try {
            await attendanceApi.endSession(sessionId);
            await refreshData();
        } catch (error) {
            logger.error('failed to end session', { error, sessionId });
            setTeacherActionMessage(getErrorMessage(error, '结束签到失败'));
        }
    }

    async function handleCopyLink() {
        if (!activeSession?.qr_url || typeof navigator === 'undefined' || !navigator.clipboard) return;
        setIsCopyingLink(true);
        try {
            await navigator.clipboard.writeText(activeSession.qr_url);
            setTeacherActionMessage('签到链接已复制。');
        } catch (error) {
            setTeacherActionMessage(getErrorMessage(error, '复制签到链接失败'));
        } finally {
            setIsCopyingLink(false);
        }
    }

    async function handleRefreshStudentLocation() {
        setStudentGeoStatus('locating');
        setStudentGeoError('');
        try {
            const point = await requestCurrentPosition();
            setStudentPoint(point);
            setStudentGeoStatus('ready');
        } catch (error) {
            setStudentGeoStatus('error');
            setStudentGeoError(getErrorMessage(error, '重新定位失败'));
        }
    }

    async function handleCheckin(event: React.FormEvent) {
        event.preventDefault();
        if (!studentTargetSession || !studentPoint) return;

        setCheckinStatus('submitting');
        setCheckinMessage('');
        try {
            const response = await attendanceApi.checkin(studentTargetSession.id, {
                code: checkinCode,
                latitude: studentPoint.latitude,
                longitude: studentPoint.longitude,
            });
            setCheckinStatus('success');
            setCheckinMessage(response.already_checked_in ? '你已经签到过了。' : '签到成功，已通过位置校验。');
            await refreshData();
        } catch (error) {
            logger.error('failed to check in', { error, sessionId: studentTargetSession.id });
            setCheckinStatus('error');
            setCheckinMessage(getErrorMessage(error, '签到失败，请检查验证码和定位状态'));
        }
    }

    if (loading) {
        return <div className="p-6 text-gray-400">Loading attendance...</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Users className="w-6 h-6 text-purple-400" />
                    考勤管理
                </h1>
                <button
                    type="button"
                    onClick={() => void refreshData()}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-sm text-gray-200 transition hover:border-gray-500"
                >
                    <RefreshCcw className="h-4 w-4" />
                    刷新
                </button>
            </div>

            {pageError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {pageError}
                </div>
            ) : null}

            {canManage ? (
                <div className="space-y-6">
                    <section className="rounded-2xl border border-gray-700 bg-gray-800/90 p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">当前签到状态</h2>
                        {activeSession ? (
                            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                                <div className="rounded-2xl border border-green-500/30 bg-green-900/10 p-5">
                                    <div className="text-green-400 font-bold text-xl flex items-center gap-2">
                                        <Clock className="w-5 h-5 animate-pulse" />
                                        签到进行中
                                    </div>
                                    <div className="mt-3 text-4xl font-mono tracking-[0.35em] text-white">{activeSession.code}</div>
                                    <div className="mt-3 space-y-2 text-sm text-gray-300">
                                        <p>自动结束时间：{new Date(activeSession.ends_at).toLocaleString()}</p>
                                        <p>定位半径：{activeSession.radius_meters ?? radiusMeters} 米</p>
                                        <p>中心点：{formatCoordinate({
                                            latitude: activeSession.center_latitude ?? 0,
                                            longitude: activeSession.center_longitude ?? 0,
                                        })}</p>
                                    </div>
                                    <div className="mt-5 flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => void handleEndSession(activeSession.id)}
                                            className="rounded-lg bg-red-600 px-5 py-2.5 text-white transition hover:bg-red-500"
                                        >
                                            结束签到
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopyLink()}
                                            disabled={!activeSession.qr_url || isCopyingLink}
                                            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 px-5 py-2.5 text-gray-100 transition hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <Copy className="h-4 w-4" />
                                            {isCopyingLink ? '复制中...' : '复制签到链接'}
                                        </button>
                                    </div>
                                    {teacherActionMessage ? (
                                        <p className="mt-4 text-sm text-emerald-300">{teacherActionMessage}</p>
                                    ) : null}
                                </div>

                                <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 flex flex-col items-center justify-center">
                                    <div className="mb-3 flex items-center gap-2 text-sm text-gray-300">
                                        <QrCode className="h-4 w-4 text-purple-300" />
                                        扫码直达签到页
                                    </div>
                                    {activeSession.qr_url ? (
                                        <QRCode
                                            value={activeSession.qr_url}
                                            size={180}
                                            bgColor="transparent"
                                            color="#ffffff"
                                            bordered={false}
                                        />
                                    ) : (
                                        <p className="text-sm text-gray-500">二维码生成中</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                    <label className="space-y-2">
                                        <span className="text-sm text-gray-300">签到时长（分钟）</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="60"
                                            value={timeoutMinutes}
                                            onChange={(event) => setTimeoutMinutes(Number(event.target.value) || 15)}
                                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-purple-500"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-gray-300">定位半径（米）</span>
                                        <input
                                            type="number"
                                            min="30"
                                            max="500"
                                            value={radiusMeters}
                                            onChange={(event) => setRadiusMeters(Number(event.target.value) || 100)}
                                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-purple-500"
                                        />
                                    </label>
                                    <div className="space-y-2">
                                        <span className="text-sm text-gray-300">老师定位状态</span>
                                        <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200">
                                            {teacherGeoStatus === 'ready'
                                                ? `已定位：${formatCoordinate(teacherPoint)}`
                                                : teacherGeoStatus === 'locating'
                                                    ? '定位中...'
                                                    : '发起时将读取当前位置'}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-sm text-gray-300">定位要求</span>
                                        <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200">
                                            学生必须在围栏内签到
                                        </div>
                                    </div>
                                </div>
                                {teacherGeoError ? (
                                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                        {teacherGeoError}
                                    </div>
                                ) : null}
                                {teacherActionMessage ? (
                                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                        {teacherActionMessage}
                                    </div>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => void handleStartSession()}
                                    disabled={isStartingSession}
                                    className="rounded-xl bg-purple-600 px-5 py-3 font-medium text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isStartingSession ? '正在获取位置并发起签到...' : '发起二维码签到'}
                                </button>
                            </div>
                        )}
                    </section>

                    <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
                        <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-4">
                            <h3 className="mb-3 text-sm font-medium text-gray-300">历史场次</h3>
                            <div className="space-y-2 max-h-[420px] overflow-y-auto">
                                {sessions.map((session) => (
                                    <button
                                        key={session.id}
                                        type="button"
                                        onClick={() => setSelectedSessionId(session.id)}
                                        className={`w-full rounded-xl border p-3 text-left transition ${
                                            selectedSessionId === session.id
                                                ? 'border-purple-500/60 bg-purple-900/30'
                                                : 'border-gray-800 bg-gray-900/60 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-white">
                                                {new Date(session.start_at).toLocaleDateString()}
                                            </span>
                                            <span className="text-xs text-gray-400">{session.attendee_count} 人</span>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {new Date(session.start_at).toLocaleTimeString()} · 半径 {session.radius_meters ?? '--'} 米
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-4">
                            <h3 className="mb-3 text-sm font-medium text-gray-300">
                                {selectedSessionId ? '签到记录与定位审计' : '请选择场次查看详情'}
                            </h3>
                            {selectedSession ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="border-b border-gray-700 text-gray-400">
                                            <tr>
                                                <th className="pb-3">姓名</th>
                                                <th className="pb-3">签到时间</th>
                                                <th className="pb-3">位置校验</th>
                                                <th className="pb-3">坐标</th>
                                                <th className="pb-3">距中心点</th>
                                                <th className="pb-3">IP</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-200">
                                            {records.map((record) => {
                                                const hasCenter =
                                                    typeof selectedSession.center_latitude === 'number' &&
                                                    typeof selectedSession.center_longitude === 'number';
                                                const distance = hasCenter
                                                    ? distanceMeters(
                                                        selectedSession.center_latitude ?? 0,
                                                        selectedSession.center_longitude ?? 0,
                                                        record.latitude,
                                                        record.longitude
                                                    )
                                                    : null;
                                                return (
                                                    <tr key={record.student_id} className="border-b border-gray-800 last:border-0">
                                                        <td className="py-3">{record.student_name}</td>
                                                        <td className="py-3">{new Date(record.checked_in_at).toLocaleString()}</td>
                                                        <td className="py-3">
                                                            <span className={record.location_validated ? 'text-emerald-300' : 'text-red-300'}>
                                                                {record.location_validated ? '通过' : '未通过'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-gray-400">
                                                            {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}
                                                        </td>
                                                        <td className="py-3 text-gray-400">
                                                            {distance === null ? '--' : `${Math.round(distance)} 米`}
                                                        </td>
                                                        <td className="py-3 text-gray-500">{record.ip_address}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="py-10 text-center text-gray-500">暂无场次数据</p>
                            )}
                        </div>
                    </section>
                </div>
            ) : (
                <div className="mx-auto max-w-lg">
                    <div className="rounded-3xl border border-gray-700 bg-gray-800/90 p-8 text-center shadow-xl">
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-purple-600/20">
                            <QrCode className="h-10 w-10 text-purple-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">课堂签到</h2>

                        {invalidSessionLink ? (
                            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-5 text-sm text-red-200">
                                当前二维码链接已失效，请重新扫描老师展示的最新二维码。
                            </div>
                        ) : studentTargetSession ? (
                            <div className="mt-6 space-y-5 text-left">
                                <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm text-gray-400">定位状态</p>
                                            <p className="mt-1 text-base text-white">
                                                {studentGeoStatus === 'ready'
                                                    ? '已获取当前位置'
                                                    : studentGeoStatus === 'locating'
                                                        ? '正在获取当前位置...'
                                                        : '尚未完成定位'}
                                            </p>
                                            <p className="mt-2 text-xs text-gray-500">
                                                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                                                {studentPoint ? formatCoordinate(studentPoint) : '需要授权定位后才能签到'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleRefreshStudentLocation()}
                                            className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-100 transition hover:border-gray-400"
                                        >
                                            重新定位
                                        </button>
                                    </div>
                                    {studentGeoError ? (
                                        <p className="mt-3 text-sm text-red-300">{studentGeoError}</p>
                                    ) : null}
                                </div>

                                {checkinStatus === 'success' ? (
                                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-8 text-center text-emerald-200">
                                        <CheckCircle className="mx-auto mb-4 h-16 w-16" />
                                        <p className="text-lg font-semibold">签到成功</p>
                                        <p className="mt-2 text-sm">{checkinMessage}</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleCheckin} className="space-y-4">
                                        <p className="text-sm text-gray-400">请输入老师公布的 6 位签到码，并确保你已授权定位。</p>
                                        <input
                                            type="text"
                                            maxLength={6}
                                            value={checkinCode}
                                            onChange={(event) => setCheckinCode(event.target.value.replace(/\D/g, ''))}
                                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-4 text-center text-3xl font-mono tracking-[0.6em] text-white outline-none focus:border-purple-500"
                                            placeholder="000000"
                                        />
                                        {checkinStatus === 'error' ? (
                                            <p className="text-sm text-red-300">{checkinMessage}</p>
                                        ) : null}
                                        <button
                                            type="submit"
                                            disabled={studentGeoStatus !== 'ready' || !studentPoint || checkinCode.length !== 6 || checkinStatus === 'submitting'}
                                            className="w-full rounded-xl bg-purple-600 py-3 font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {checkinStatus === 'submitting' ? '签到中...' : '立即签到'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        ) : (
                            <div className="mt-6 rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-6 text-gray-400">
                                当前没有正在进行的签到
                            </div>
                        )}

                        <div className="mt-8 border-t border-gray-700 pt-6 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">累计出勤率</span>
                                <span className="font-bold text-white">
                                    {summary?.sessions_count ? Math.round(summary.attendance_rate * 100) : 0}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
