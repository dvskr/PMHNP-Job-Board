
/**
 * Structured Logger for Production
 * 
 * Features:
 * - Log levels (debug, info, warn, error)
 * - JSON format in production, pretty in development
 * - Request context support
 * - Timestamp and metadata
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    requestId?: string;
    userId?: string;
    path?: string;
    method?: string;
    [key: string]: unknown;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: LogContext;
    error?: {
        message: string;
        stack?: string;
        name?: string;
    };
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

function getMinLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
    if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
        return envLevel;
    }
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[getMinLogLevel()];
}

function formatError(error: unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
            name: error.name,
        };
    }

    return {
        message: String(error),
    };
}

function formatLog(level: LogLevel, message: string, context?: LogContext, error?: unknown): string {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
    };

    if (context && Object.keys(context).length > 0) {
        entry.context = context;
    }

    if (error) {
        entry.error = formatError(error);
    }

    // JSON in production, pretty in development
    if (process.env.NODE_ENV === 'production') {
        try {
            return JSON.stringify(entry);
        } catch (err) {
            // Fallback for circular references or other serialization errors
            try {
                // Simple cycle-breaking serializer
                const getCircularReplacer = () => {
                    const seen = new WeakSet();
                    return (key: string, value: unknown) => {
                        if (typeof value === "object" && value !== null) {
                            if (seen.has(value)) {
                                return "[Circular]";
                            }
                            seen.add(value);
                        }
                        return value;
                    };
                };
                return JSON.stringify(entry, getCircularReplacer());
            } catch (fallbackErr) {
                // Ultimate fallback
                return `{"timestamp":"${entry.timestamp}","level":"error","message":"Failed to serialize log entry","error":"${String(err)}"}`;
            }
        }
    }

    // Pretty format for development
    const levelColors: Record<LogLevel, string> = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m',  // green
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m', // red
    };
    const reset = '\x1b[0m';
    const color = levelColors[level];

    let output = `${color}[${level.toUpperCase()}]${reset} ${entry.timestamp} - ${message}`;

    if (context && Object.keys(context).length > 0) {
        output += `\n  Context: ${JSON.stringify(context, null, 2)}`;
    }

    if (error) {
        const formattedError = formatError(error);
        output += `\n  Error: ${formattedError?.message}`;
        if (formattedError?.stack) {
            output += `\n  Stack: ${formattedError.stack}`;
        }
    }

    return output;
}

class Logger {
    private context: LogContext = {};

    /**
     * Create a child logger with additional context
     */
    withContext(context: LogContext): Logger {
        const child = new Logger();
        child.context = { ...this.context, ...context };
        return child;
    }

    /**
     * Create a logger with request context
     */
    withRequest(requestId: string, path?: string, method?: string): Logger {
        return this.withContext({ requestId, path, method });
    }

    debug(message: string, context?: LogContext): void {
        if (!shouldLog('debug')) return;
        const output = formatLog('debug', message, { ...this.context, ...context });
        console.log(output);
    }

    info(message: string, context?: LogContext): void {
        if (!shouldLog('info')) return;
        const output = formatLog('info', message, { ...this.context, ...context });
        console.log(output);
    }

    warn(message: string, context?: LogContext, error?: unknown): void {
        if (!shouldLog('warn')) return;
        const output = formatLog('warn', message, { ...this.context, ...context }, error);
        console.warn(output);
    }

    error(message: string, error?: unknown, context?: LogContext): void {
        if (!shouldLog('error')) return;
        const output = formatLog('error', message, { ...this.context, ...context }, error);
        console.error(output);
    }
}

// Singleton logger instance
export const logger = new Logger();

// Helper to create request-scoped logger
export function createRequestLogger(request: Request): Logger {
    const url = new URL(request.url);
    // Use global crypto for Edge/Node compatibility
    const requestId = crypto.randomUUID().slice(0, 8);
    return logger.withRequest(requestId, url.pathname, request.method);
}

export default logger;
