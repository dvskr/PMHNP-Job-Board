/**
 * Shadow DOM utility functions for traversing web component shadow roots.
 * Many modern ATS platforms (SmartRecruiters, etc.) use web components
 * with Shadow DOM, making standard querySelectorAll insufficient.
 */

/**
 * Query all elements matching a selector, including inside shadow roots.
 * Recursively traverses all shadow roots in the document tree.
 */
export function querySelectorAllDeep<T extends Element = Element>(
    selector: string,
    root: Document | ShadowRoot | Element = document
): T[] {
    const results: T[] = [];

    // Query in the current root
    const directMatches = (root instanceof Element ? root : root).querySelectorAll<T>(selector);
    results.push(...Array.from(directMatches));

    // Recursively search shadow roots
    const allElements = (root instanceof Element ? root : root).querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            results.push(...querySelectorAllDeep<T>(selector, el.shadowRoot));
        }
    }

    return results;
}

/**
 * Query a single element matching a selector, including inside shadow roots.
 */
export function querySelectorDeep<T extends Element = Element>(
    selector: string,
    root: Document | ShadowRoot | Element = document
): T | null {
    // Query in the current root
    const directMatch = (root instanceof Element ? root : root).querySelector<T>(selector);
    if (directMatch) return directMatch;

    // Recursively search shadow roots
    const allElements = (root instanceof Element ? root : root).querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            const shadowMatch = querySelectorDeep<T>(selector, el.shadowRoot);
            if (shadowMatch) return shadowMatch;
        }
    }

    return null;
}

/**
 * Find all elements matching a text content filter, including inside shadow DOM.
 * Useful for finding buttons by their label text.
 */
export function findElementsByText(
    tagName: string,
    textFilter: (text: string) => boolean,
    root: Document | ShadowRoot | Element = document
): HTMLElement[] {
    const results: HTMLElement[] = [];

    const elements = (root instanceof Element ? root : root).querySelectorAll(tagName);
    for (const el of elements) {
        const text = el.textContent?.trim() || '';
        if (textFilter(text)) {
            results.push(el as HTMLElement);
        }
    }

    // Recursively search shadow roots
    const allElements = (root instanceof Element ? root : root).querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            results.push(...findElementsByText(tagName, textFilter, el.shadowRoot));
        }
    }

    return results;
}

/**
 * Get all text content visible on screen, traversing shadow DOM.
 * Useful for debugging what the page actually shows.
 */
export function getVisibleText(root: Document | ShadowRoot | Element = document): string {
    const texts: string[] = [];

    const walker = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) texts.push(text);
        }
        if (node instanceof HTMLElement && node.shadowRoot) {
            walker(node.shadowRoot);
        }
        for (const child of node.childNodes) {
            walker(child);
        }
    };

    walker(root instanceof Document ? root.body : root);
    return texts.join(' ');
}
