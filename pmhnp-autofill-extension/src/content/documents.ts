import type { DocumentEntry, DocumentAttachResult } from '@/shared/types';
import { getAuthHeaders } from '@/shared/auth';
import { API_BASE_URL } from '@/shared/constants';

/**
 * Downloads a file from the user's profile document URL and attaches it to a file input.
 */
export async function attachDocuments(
    fileFields: { element: HTMLElement; documentType: string | null }[],
    documents: DocumentEntry[]
): Promise<DocumentAttachResult> {
    const result: DocumentAttachResult = {
        total: fileFields.length,
        attached: 0,
        failed: 0,
        details: [],
    };

    for (const { element, documentType } of fileFields) {
        if (!documentType) {
            result.failed++;
            result.details.push({
                fieldLabel: getFieldLabel(element),
                documentType: 'unknown',
                status: 'no_document',
                error: 'Could not determine document type',
            });
            continue;
        }

        // Find matching document from profile
        const doc = findMatchingDocument(documentType, documents);
        if (!doc) {
            result.failed++;
            result.details.push({
                fieldLabel: getFieldLabel(element),
                documentType,
                status: 'no_document',
                error: `No ${documentType} document found in profile`,
            });
            continue;
        }

        try {
            const file = await downloadDocument(doc);
            const success = await attachFileToInput(element as HTMLInputElement, file);

            if (success) {
                result.attached++;
                result.details.push({
                    fieldLabel: getFieldLabel(element),
                    documentType,
                    status: 'attached',
                });
            } else {
                // Try drag-and-drop fallback
                const dropSuccess = await attachViaDragAndDrop(element, file);
                if (dropSuccess) {
                    result.attached++;
                    result.details.push({
                        fieldLabel: getFieldLabel(element),
                        documentType,
                        status: 'attached',
                    });
                } else {
                    result.failed++;
                    result.details.push({
                        fieldLabel: getFieldLabel(element),
                        documentType,
                        status: 'failed',
                        error: 'Could not attach file to input',
                    });
                }
            }
        } catch (err) {
            result.failed++;
            result.details.push({
                fieldLabel: getFieldLabel(element),
                documentType,
                status: 'failed',
                error: err instanceof Error ? err.message : 'Download failed',
            });
        }
    }

    return result;
}

/**
 * Downloads a document blob from the file URL.
 * Uses authenticated proxy if the URL is on pmhnphiring.com.
 */
async function downloadDocument(doc: DocumentEntry): Promise<File> {
    let blob: Blob;

    if (doc.fileUrl.includes('pmhnphiring.com') || doc.fileUrl.startsWith('/')) {
        // Authenticated download through our API
        const headers = await getAuthHeaders();
        const url = doc.fileUrl.startsWith('/') ? `${API_BASE_URL}${doc.fileUrl}` : doc.fileUrl;
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        blob = await response.blob();
    } else {
        // Direct download (e.g. from cloud storage signed URL)
        const response = await fetch(doc.fileUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        blob = await response.blob();
    }

    // Determine MIME type
    const mimeType = blob.type || guessMimeType(doc.fileName);
    return new File([blob], doc.fileName, { type: mimeType });
}

/**
 * Attaches a File to an <input type="file"> using DataTransfer.
 */
async function attachFileToInput(input: HTMLInputElement, file: File): Promise<boolean> {
    try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;

        // Dispatch events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Verify
        return input.files !== null && input.files.length > 0;
    } catch {
        return false;
    }
}

/**
 * Fallback: simulates drag-and-drop for drop-zone upload UIs.
 */
async function attachViaDragAndDrop(element: HTMLElement, file: File): Promise<boolean> {
    try {
        // Find the drop zone (might be the element itself or a parent/sibling)
        const dropZone = findDropZone(element) || element;

        const dt = new DataTransfer();
        dt.items.add(file);

        // Simulate drag-and-drop sequence
        const dragEnterEvent = new DragEvent('dragenter', { bubbles: true, dataTransfer: dt });
        const dragOverEvent = new DragEvent('dragover', { bubbles: true, dataTransfer: dt });
        const dropEvent = new DragEvent('drop', { bubbles: true, dataTransfer: dt });

        dropZone.dispatchEvent(dragEnterEvent);
        await sleep(100);
        dropZone.dispatchEvent(dragOverEvent);
        await sleep(100);
        dropZone.dispatchEvent(dropEvent);

        return true;
    } catch {
        return false;
    }
}

/**
 * Find a drop zone element near the file input.
 */
function findDropZone(element: HTMLElement): HTMLElement | null {
    // Look for common drop zone patterns near the file input
    const parent = element.parentElement;
    if (!parent) return null;

    const selectors = [
        '[class*="drop-zone"]',
        '[class*="dropzone"]',
        '[class*="upload-area"]',
        '[class*="file-upload"]',
        '[class*="drag-drop"]',
        '[data-testid*="upload"]',
        '[role="button"][class*="upload"]',
    ];

    for (const selector of selectors) {
        const zone = parent.querySelector<HTMLElement>(selector);
        if (zone) return zone;
    }

    // Check parent itself
    const parentClass = parent.className?.toLowerCase() || '';
    if (parentClass.includes('drop') || parentClass.includes('upload')) {
        return parent;
    }

    return null;
}

// ─── Document Matching ───

function findMatchingDocument(documentType: string, documents: DocumentEntry[]): DocumentEntry | null {
    // Direct type match
    const directMatch = documents.find(
        (d) => d.documentType.toLowerCase() === documentType.toLowerCase()
    );
    if (directMatch) return directMatch;

    // Fuzzy match by document type
    const typeAliases: Record<string, string[]> = {
        resume: ['resume', 'cv', 'curriculum_vitae'],
        cover_letter: ['cover_letter', 'cover letter', 'covering_letter'],
        license: ['license', 'nursing_license', 'rn_license', 'aprn_license', 'state_license'],
        certification: ['certification', 'ancc_certification', 'board_certification', 'pmhnp_certification'],
        dea_registration: ['dea_registration', 'dea', 'dea_certificate'],
        malpractice_certificate: ['malpractice', 'malpractice_certificate', 'malpractice_insurance', 'insurance_certificate'],
        cpr_card: ['cpr', 'bls', 'cpr_card', 'bls_card'],
        transcript: ['transcript', 'academic_transcript', 'school_transcript'],
        diploma: ['diploma', 'degree', 'degree_certificate'],
        reference_letter: ['reference', 'reference_letter', 'letter_of_recommendation'],
    };

    const aliases = typeAliases[documentType] || [documentType];
    for (const alias of aliases) {
        const match = documents.find(
            (d) =>
                d.documentType.toLowerCase().includes(alias) ||
                d.documentLabel.toLowerCase().includes(alias)
        );
        if (match) return match;
    }

    return null;
}

// ─── Helpers ───

function getFieldLabel(element: HTMLElement): string {
    const id = element.id;
    if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent?.trim() || '';
    }
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent?.trim() || '';
    return element.getAttribute('aria-label') || 'File upload';
}

function guessMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        txt: 'text/plain',
        rtf: 'application/rtf',
    };
    return mimeMap[ext || ''] || 'application/octet-stream';
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
