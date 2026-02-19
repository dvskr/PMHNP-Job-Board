/**
 * Test setup — mock Chrome APIs.
 */

// Mock chrome.storage
const storage: Record<string, unknown> = {};

const mockChromeStorage = {
    local: {
        get: vi.fn((keys: string | string[]) => {
            const result: Record<string, unknown> = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const key of keyArray) {
                if (storage[key] !== undefined) {
                    result[key] = storage[key];
                }
            }
            return Promise.resolve(result);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(storage, items);
            return Promise.resolve();
        }),
        remove: vi.fn((keys: string | string[]) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const key of keyArray) {
                delete storage[key];
            }
            return Promise.resolve();
        }),
    },
    sync: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
    },
};

const mockChrome = {
    storage: mockChromeStorage,
    runtime: {
        sendMessage: vi.fn(() => Promise.resolve({})),
        onMessage: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
        },
        getManifest: vi.fn(() => ({ version: '1.0.0' })),
    },
};

// Assign to global
Object.defineProperty(globalThis, 'chrome', {
    value: mockChrome,
    writable: true,
});

// Polyfill CSS.escape for jsdom (not implemented natively)
if (typeof globalThis.CSS === 'undefined') {
    (globalThis as any).CSS = {};
}
if (typeof (globalThis as any).CSS.escape !== 'function') {
    (globalThis as any).CSS.escape = (value: string): string => {
        // Simple polyfill — escape special CSS selector characters
        return value.replace(/([^\w-])/g, '\\$1');
    };
}
