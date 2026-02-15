import { captureError } from '@/shared/errorHandler';

type FieldChangeCallback = (addedElements: HTMLElement[]) => void;

interface ObserverConfig {
    /** Debounce delay in ms for re-detection after DOM changes */
    debounceMs: number;
    /** Whether to observe shadow DOMs */
    observeShadowDOM: boolean;
    /** Whether to observe iframes */
    observeIframes: boolean;
}

const DEFAULT_CONFIG: ObserverConfig = {
    debounceMs: 300,
    observeShadowDOM: true,
    observeIframes: true,
};

/**
 * DOMObserver watches for dynamically added form elements and triggers
 * re-detection when new fields appear. This is critical for:
 * - SPA forms that render progressively (React, Angular, Vue)
 * - Conditional fields that appear after answering a question
 * - AJAX-loaded form sections
 * - Multi-step forms within a single page
 */
export class DOMObserver {
    private observer: MutationObserver | null = null;
    private shadowObservers: Map<ShadowRoot, MutationObserver> = new Map();
    private iframeObservers: Map<HTMLIFrameElement, MutationObserver> = new Map();
    private callback: FieldChangeCallback;
    private config: ObserverConfig;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingElements: HTMLElement[] = [];
    private isActive = false;

    constructor(callback: FieldChangeCallback, config: Partial<ObserverConfig> = {}) {
        this.callback = callback;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Start observing the DOM for form field changes.
     */
    start(): void {
        if (this.isActive) return;
        this.isActive = true;

        // Main document observer
        this.observer = new MutationObserver(this.handleMutations.bind(this));
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['type', 'name', 'id', 'class', 'aria-label', 'role', 'style', 'hidden', 'disabled'],
        });

        // Observe existing shadow DOMs
        if (this.config.observeShadowDOM) {
            this.observeExistingShadowRoots(document.body);
        }

        // Observe existing iframes
        if (this.config.observeIframes) {
            this.observeExistingIframes();
        }

        console.log('[PMHNP-Observer] Started watching for DOM changes');
    }

    /**
     * Stop all observers.
     */
    stop(): void {
        this.isActive = false;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        for (const [, obs] of this.shadowObservers) {
            obs.disconnect();
        }
        this.shadowObservers.clear();

        for (const [, obs] of this.iframeObservers) {
            obs.disconnect();
        }
        this.iframeObservers.clear();

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        this.pendingElements = [];
        console.log('[PMHNP-Observer] Stopped watching');
    }

    /**
     * Handle mutation records from the main observer.
     */
    private handleMutations(mutations: MutationRecord[]): void {
        const newFormElements: HTMLElement[] = [];

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node instanceof HTMLElement) {
                        // Check if the node itself is a form element
                        if (this.isFormElement(node)) {
                            newFormElements.push(node);
                        }

                        // Check children for form elements
                        const children = node.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"], [contenteditable="true"]');
                        for (const child of children) {
                            if (child instanceof HTMLElement) {
                                newFormElements.push(child);
                            }
                        }

                        // Watch new shadow roots
                        if (this.config.observeShadowDOM && node.shadowRoot) {
                            this.observeShadowRoot(node.shadowRoot);
                        }

                        // Watch for shadow roots in children
                        if (this.config.observeShadowDOM) {
                            this.observeExistingShadowRoots(node);
                        }
                    }
                }
            }

            if (mutation.type === 'attributes') {
                const target = mutation.target as HTMLElement;
                // An element became visible or its type changed — might be a newly revealed form field
                if (this.isFormElement(target)) {
                    const wasHidden = mutation.attributeName === 'style' || mutation.attributeName === 'hidden' || mutation.attributeName === 'class';
                    if (wasHidden && this.isVisible(target)) {
                        newFormElements.push(target);
                    }
                }
            }
        }

        if (newFormElements.length > 0) {
            this.pendingElements.push(...newFormElements);
            this.debouncedNotify();
        }
    }

    /**
     * Debounced notification to avoid excessive re-detection.
     */
    private debouncedNotify(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            if (this.pendingElements.length > 0) {
                // Deduplicate
                const unique = [...new Set(this.pendingElements)];
                this.pendingElements = [];

                console.log(`[PMHNP-Observer] ${unique.length} new form elements detected`);
                try {
                    this.callback(unique);
                } catch (err) {
                    captureError(err, 'dom-observer-callback');
                }
            }
        }, this.config.debounceMs);
    }

    /**
     * Observe a shadow root for form field changes.
     */
    private observeShadowRoot(shadowRoot: ShadowRoot): void {
        if (this.shadowObservers.has(shadowRoot)) return;

        const observer = new MutationObserver(this.handleMutations.bind(this));
        observer.observe(shadowRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['type', 'name', 'id', 'class', 'style', 'hidden'],
        });

        this.shadowObservers.set(shadowRoot, observer);
    }

    /**
     * Find and observe all existing shadow roots in a subtree.
     */
    private observeExistingShadowRoots(root: Element | Document | ShadowRoot): void {
        const elements = root.querySelectorAll('*');
        for (const el of elements) {
            if (el.shadowRoot) {
                this.observeShadowRoot(el.shadowRoot);
                // Recurse into shadow root
                this.observeExistingShadowRoots(el.shadowRoot);
            }
        }
    }

    /**
     * Observe same-origin iframes.
     */
    private observeExistingIframes(): void {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            this.observeIframe(iframe);
        }
    }

    /**
     * Try to observe an iframe's document.
     */
    private observeIframe(iframe: HTMLIFrameElement): void {
        if (this.iframeObservers.has(iframe)) return;

        try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc?.body) return;

            const observer = new MutationObserver(this.handleMutations.bind(this));
            observer.observe(iframeDoc.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['type', 'name', 'id', 'class', 'style', 'hidden'],
            });

            this.iframeObservers.set(iframe, observer);
        } catch {
            // Cross-origin iframe — can't observe
        }
    }

    /**
     * Check if an element is a form element.
     */
    private isFormElement(el: HTMLElement): boolean {
        const tag = el.tagName?.toLowerCase();
        if (['input', 'select', 'textarea'].includes(tag)) return true;
        if (el.getAttribute('role') === 'combobox') return true;
        if (el.getAttribute('role') === 'listbox') return true;
        if (el.getAttribute('contenteditable') === 'true') return true;
        if (el.classList?.contains('ql-editor')) return true; // Quill
        if (el.id === 'tinymce') return true; // TinyMCE
        return false;
    }

    /**
     * Check if an element is visible.
     */
    private isVisible(el: HTMLElement): boolean {
        if (el.hidden) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }
}

// ─── Singleton ───

let observerInstance: DOMObserver | null = null;

export function getDOMObserver(callback: FieldChangeCallback): DOMObserver {
    if (!observerInstance) {
        observerInstance = new DOMObserver(callback);
    }
    return observerInstance;
}

export function stopDOMObserver(): void {
    if (observerInstance) {
        observerInstance.stop();
        observerInstance = null;
    }
}
