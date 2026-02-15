/**
 * Rich text editor handler.
 * Fills CKEditor, TinyMCE, Quill, ProseMirror, and contenteditable elements.
 */

/**
 * Fill a rich text editor or contenteditable element.
 */
export async function fillRichText(
    element: HTMLElement,
    value: string
): Promise<boolean> {
    if (!value) return false;

    // Try CKEditor 5
    if (await tryCKEditor5(element, value)) return true;

    // Try CKEditor 4
    if (await tryCKEditor4(element, value)) return true;

    // Try TinyMCE
    if (await tryTinyMCE(element, value)) return true;

    // Try Quill
    if (await tryQuill(element, value)) return true;

    // Try ProseMirror
    if (await tryProseMirror(element, value)) return true;

    // Fallback to contenteditable
    return fillContentEditable(element, value);
}

async function tryCKEditor5(element: HTMLElement, value: string): Promise<boolean> {
    try {
        const editorElement = element.closest('.ck-editor') || element.querySelector('.ck-editor');
        if (!editorElement) return false;

        // CKEditor 5 stores instance on the source element
        const sourceEl = editorElement.querySelector('.ck-editor__editable') as HTMLElement & {
            ckeditorInstance?: { setData: (data: string) => void };
        };

        if (sourceEl?.ckeditorInstance) {
            sourceEl.ckeditorInstance.setData(`<p>${escapeHtml(value)}</p>`);
            return true;
        }

        // Try the contenteditable fallback for CK5
        if (sourceEl) {
            return fillContentEditable(sourceEl, value);
        }
    } catch {
        // CKEditor not available
    }
    return false;
}

async function tryCKEditor4(element: HTMLElement, value: string): Promise<boolean> {
    try {
        // CKEditor 4 is typically in an iframe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const CKEDITOR = (window as any).CKEDITOR;
        if (!CKEDITOR?.instances) return false;

        for (const name in CKEDITOR.instances) {
            const editor = CKEDITOR.instances[name];
            const edContainer = editor.container?.$;
            if (edContainer && (element === edContainer || element.contains(edContainer) || edContainer.contains(element))) {
                editor.setData(`<p>${escapeHtml(value)}</p>`);
                return true;
            }
        }
    } catch {
        // CKEditor 4 not available
    }
    return false;
}

async function tryTinyMCE(element: HTMLElement, value: string): Promise<boolean> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tinymce = (window as any).tinymce;
        if (!tinymce?.editors) return false;

        for (const editor of tinymce.editors) {
            const edElement = editor.getElement();
            const edContainer = editor.getContainer();
            if (element === edElement || element === edContainer ||
                element.contains(edContainer) || edContainer?.contains(element)) {
                editor.setContent(`<p>${escapeHtml(value)}</p>`);
                editor.fire('change');
                return true;
            }
        }
    } catch {
        // TinyMCE not available
    }
    return false;
}

async function tryQuill(element: HTMLElement, value: string): Promise<boolean> {
    try {
        const qlEditor = element.closest('.ql-container') || element.querySelector('.ql-container');
        if (!qlEditor) return false;

        // Quill stores its instance on the element
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quill = (qlEditor as any).__quill;
        if (quill) {
            quill.setText(value);
            return true;
        }

        // Fallback: find the editable div inside Quill
        const editableDiv = qlEditor.querySelector('.ql-editor') as HTMLElement;
        if (editableDiv) {
            return fillContentEditable(editableDiv, value);
        }
    } catch {
        // Quill not available
    }
    return false;
}

async function tryProseMirror(element: HTMLElement, value: string): Promise<boolean> {
    try {
        const pmEditor = element.closest('.ProseMirror') || element.querySelector('.ProseMirror');
        if (!pmEditor || !(pmEditor instanceof HTMLElement)) return false;

        return fillContentEditable(pmEditor, value);
    } catch {
        // ProseMirror not available
    }
    return false;
}

function fillContentEditable(element: HTMLElement, value: string): boolean {
    if (element.getAttribute('contenteditable') !== 'true' &&
        !element.closest('[contenteditable="true"]') &&
        !element.classList.contains('ql-editor') &&
        !element.classList.contains('ProseMirror')) {
        // Not a contenteditable — try anyway
        element.setAttribute('contenteditable', 'true');
    }

    // Focus
    element.focus();
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    // Clear and set
    element.innerHTML = `<p>${escapeHtml(value)}</p>`;

    // Fire events
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
