import { appendErrorLog } from './storage';

export function captureError(error: unknown, context: string): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error(`[PMHNP] Error in ${context}:`, error);

    appendErrorLog({
        timestamp: new Date().toISOString(),
        message,
        context,
        stack,
    }).catch(() => {
        // Silently fail if storage write fails
    });
}

export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    context: string
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await fn(...args);
        } catch (err) {
            captureError(err, context);
            throw err;
        }
    }) as T;
}
