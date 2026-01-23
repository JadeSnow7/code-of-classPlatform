import { useEffect, useRef, useState } from 'react';
import { chapterApi } from '@/api/chapter';
import { Timer, AlertCircle } from 'lucide-react';

interface StudyTimerProps {
    chapterId: number;
    initialDuration: number; // in seconds
    onDurationUpdate?: (newDuration: number) => void;
}

export function StudyTimer({ chapterId, initialDuration, onDurationUpdate }: StudyTimerProps) {
    const [duration, setDuration] = useState(initialDuration);
    const [isTracking, setIsTracking] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use refs to access latest values in effects/intervals
    const durationRef = useRef(initialDuration);
    const isTrackingRef = useRef(true);

    useEffect(() => {
        setDuration(initialDuration);
        durationRef.current = initialDuration;
    }, [initialDuration]);

    useEffect(() => {
        // Visibility API handler
        const handleVisibilityChange = () => {
            const isVisible = document.visibilityState === 'visible';
            setIsTracking(isVisible);
            isTrackingRef.current = isVisible;
        };

        // Window Focus handler (optional, stricter)
        const handleFocus = () => {
            setIsTracking(true);
            isTrackingRef.current = true;
        };
        const handleBlur = () => {
            setIsTracking(false);
            isTrackingRef.current = false;
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    useEffect(() => {
        // Heartbeat interval (30 seconds)
        // We set it slightly shorter (e.g. 29s) or exactly 30s. 
        // Logic: Frontend calls heartbeat every 30s. Backend treats calls within 35s as valid increment.
        const intervalId = setInterval(async () => {
            if (!isTrackingRef.current) return;

            try {
                const res = await chapterApi.heartbeat(chapterId);
                setDuration(res.duration);
                durationRef.current = res.duration;
                if (onDurationUpdate) {
                    onDurationUpdate(res.duration);
                }
                setError(null);
            } catch (err) {
                console.error('Heartbeat failed:', err);
                setError('同步失败');
                // Don't stop tracking on network error, retry next time
            }
        }, 30000);

        return () => clearInterval(intervalId);
    }, [chapterId, onDurationUpdate]);

    // Format duration helper
    const formatTime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return h > 0 ? `${h}小时${m}分钟` : `${m}分钟`;
    };

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700">
            <Timer className={`w-4 h-4 ${isTracking ? 'text-green-500 animate-pulse' : 'text-gray-500'}`} />
            <span className="text-sm font-medium text-gray-300">
                学习时长: <span className="text-white">{formatTime(duration)}</span>
            </span>
            {!isTracking && (
                <span className="text-xs text-yellow-500 ml-1">(暂停中)</span>
            )}
            {error && (
                <div className="flex items-center gap-1 text-xs text-red-500 ml-1" title={error}>
                    <AlertCircle className="w-3 h-3" />
                </div>
            )}
        </div>
    );
}
