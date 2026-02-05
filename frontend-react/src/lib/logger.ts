type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

interface LogContext {
    [key: string]: unknown;
}

class Logger {
    private level: number;
    private environment: string;

    constructor() {
        this.environment = import.meta.env.MODE;
        const configured = (import.meta.env.VITE_LOG_LEVEL || '').toLowerCase() as LogLevel;
        const fallback: LogLevel = this.environment === 'production' ? 'info' : 'debug';
        this.level = LOG_LEVELS[configured] ?? LOG_LEVELS[fallback];
    }

    private shouldLog(level: LogLevel) {
        return LOG_LEVELS[level] >= this.level;
    }

    private emit(level: LogLevel, message: string, context?: LogContext) {
        if (!this.shouldLog(level)) return;

        const payload = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...context,
        };

        if (this.environment !== 'production') {
            const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
            console[method](payload);
        } else {
            // Keep a lightweight console output in production for now.
            console.log(payload);
        }
    }

    debug(message: string, context?: LogContext) {
        this.emit('debug', message, context);
    }

    info(message: string, context?: LogContext) {
        this.emit('info', message, context);
    }

    warn(message: string, context?: LogContext) {
        this.emit('warn', message, context);
    }

    error(message: string, context?: LogContext) {
        this.emit('error', message, context);
    }
}

export const logger = new Logger();
