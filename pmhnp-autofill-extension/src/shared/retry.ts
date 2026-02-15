/**
 * Retry utility with exponential backoff and jitter.
 * For resilient API calls from the Chrome extension.
 */

export interface RetryConfig {
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Initial delay in ms */
    initialDelay: number;
    /** Maximum delay in ms */
    maxDelay: number;
    /** Backoff multiplier */
    multiplier: number;
    /** Whether to add random jitter */
    jitter: boolean;
    /** HTTP status codes to retry on */
    retryableStatuses: number[];
    /** Whether to retry on network errors */
    retryOnNetworkError: boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelay: 500,
    maxDelay: 10000,
    multiplier: 2,
    jitter: true,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
    retryOnNetworkError: true,
};

/**
 * Execute a function with retry and exponential backoff.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            // Don't retry on non-retryable errors
            if (!shouldRetry(lastError, cfg)) {
                throw lastError;
            }

            // Don't retry if this was the last attempt
            if (attempt === cfg.maxRetries) {
                break;
            }

            // Calculate delay with exponential backoff + jitter
            const delay = calculateDelay(attempt, cfg);
            console.log(`[PMHNP-Retry] Attempt ${attempt + 1}/${cfg.maxRetries + 1} failed, retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }

    throw lastError || new Error('All retry attempts failed');
}

/**
 * Wrap a fetch call with retry logic.
 */
export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryConfig: Partial<RetryConfig> = {}
): Promise<Response> {
    return withRetry(async () => {
        const response = await fetch(url, options);

        if (!response.ok) {
            const cfg = { ...DEFAULT_CONFIG, ...retryConfig };
            if (cfg.retryableStatuses.includes(response.status)) {
                throw new RetryableError(`HTTP ${response.status}`, response.status);
            }
            // Non-retryable HTTP error
            throw new HttpError(`HTTP ${response.status}: ${response.statusText}`, response.status);
        }

        return response;
    }, retryConfig);
}

// ─── Offline Detection ───

let isOffline = false;
let offlineQueue: Array<{ fn: () => Promise<void>; resolve: () => void; reject: (err: Error) => void }> = [];

/**
 * Initialize offline detection.
 */
export function initOfflineDetection(): void {
    isOffline = !navigator.onLine;

    window.addEventListener('online', () => {
        console.log('[PMHNP-Retry] Back online, processing queue...');
        isOffline = false;
        processOfflineQueue();
    });

    window.addEventListener('offline', () => {
        console.log('[PMHNP-Retry] Went offline');
        isOffline = true;
    });
}

/**
 * Check if currently offline.
 */
export function checkOffline(): boolean {
    return isOffline || !navigator.onLine;
}

/**
 * Queue an operation for when the device comes back online.
 */
export function queueForOnline(fn: () => Promise<void>): Promise<void> {
    if (!isOffline) {
        return fn();
    }

    return new Promise<void>((resolve, reject) => {
        offlineQueue.push({ fn, resolve, reject });
        console.log(`[PMHNP-Retry] Queued operation (${offlineQueue.length} in queue)`);
    });
}

async function processOfflineQueue(): Promise<void> {
    const queue = [...offlineQueue];
    offlineQueue = [];

    for (const item of queue) {
        try {
            await item.fn();
            item.resolve();
        } catch (err) {
            item.reject(err instanceof Error ? err : new Error(String(err)));
        }
    }

    console.log(`[PMHNP-Retry] Processed ${queue.length} queued operations`);
}

// ─── Helpers ───

function shouldRetry(error: Error, config: RetryConfig): boolean {
    if (error instanceof RetryableError) return true;
    if (error instanceof HttpError && config.retryableStatuses.includes(error.status)) return true;
    if (config.retryOnNetworkError && isNetworkError(error)) return true;
    return false;
}

function isNetworkError(error: Error): boolean {
    return error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('net::ERR_') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT');
}

function calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.initialDelay * Math.pow(config.multiplier, attempt);
    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
        // Add random jitter of ±25%
        const jitter = delay * 0.25;
        delay += (Math.random() * 2 - 1) * jitter;
    }

    return Math.round(delay);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Custom Errors ───

export class RetryableError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'RetryableError';
        this.status = status;
    }
}

export class HttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}
