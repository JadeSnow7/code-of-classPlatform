import { useEffect, useRef, useState } from 'react';
import { chapterApi } from '@/api/chapter';
import { Timer, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';

/**
 * Props for StudyTimer.
 */
interface StudyTimerProps {
    /** Chapter ID used for heartbeat tracking. */
    chapterId: number;
    /** Initial duration in seconds. */
    initialDuration: number;
    /** Callback invoked when the server returns an updated duration. */
    onDurationUpdate?: (newDuration: number) => void;
    /** Whether to call the heartbeat endpoint periodically. */
    enableHeartbeat?: boolean;
    /** Whether tracking should start immediately. */
    initialTracking?: boolean;
    /** Initial error message to display. */
    initialError?: string | null;
}

/**
 * Displays a study timer with optional heartbeat syncing.
 *
 * @param props Component props.
 * @returns The timer UI.
 */
export function StudyTimer({
    chapterId,
    initialDuration,
    onDurationUpdate,
    enableHeartbeat = true,
    initialTracking = true,
    initialError = null,
}: StudyTimerProps) {
    const [duration, setDuration] = useState(initialDuration);
    const [isTracking, setIsTracking] = useState(initialTracking);
    const [error, setError] = useState<string | null>(initialError);

    // Use refs to access latest values in effects/intervals
    const durationRef = useRef(initialDuration);
    const isTrackingRef = useRef(initialTracking);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
        if (!enableHeartbeat) return;
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
                logger.error('heartbeat failed', { error: err, chapterId });
                setError('同步失败');
                // Don't stop tracking on network error, retry next time
            }
        }, 30000);

        return () => clearInterval(intervalId);
    }, [chapterId, onDurationUpdate, enableHeartbeat]);

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
