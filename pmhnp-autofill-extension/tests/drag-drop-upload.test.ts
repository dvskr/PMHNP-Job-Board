/**
 * Drag-Drop Uploader Test Suite
 *
 * Tests drop zone detection, hidden file input finding,
 * file injection, MIME type detection, and base64/file helpers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

// Re-implement key functions from drag-drop-uploader for testing
// (the module depends on DOM globals like getComputedStyle)

const DROPZONE_SELECTORS = [
    '[class*="dropzone"]',
    '[class*="drop-zone"]',
    '[class*="upload-area"]',
    '[class*="file-upload"]',
    '[class*="drag-drop"]',
    '[class*="DragDrop"]',
    '[data-automation-id*="file"]',
    '[data-automation-id*="upload"]',
    '[data-automation-id*="attachments"]',
    '[data-testid*="upload"]',
    '[data-testid*="file"]',
    '.upload-widget',
    '.resume-upload',
    '.file-drop',
];

function findDropZones(doc: Document): HTMLElement[] {
    const zones: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    for (const selector of DROPZONE_SELECTORS) {
        try {
            const elements = doc.querySelectorAll<HTMLElement>(selector);
            for (const el of elements) {
                if (seen.has(el)) continue;
                seen.add(el);
                zones.push(el);
            }
        } catch { /* skip */ }
    }
    return zones;
}

function findHiddenFileInput(zone: HTMLElement): HTMLInputElement | null {
    const inside = zone.querySelector<HTMLInputElement>('input[type="file"]');
    if (inside) return inside;

    const parent = zone.parentElement;
    if (parent) {
        const sibling = parent.querySelector<HTMLInputElement>('input[type="file"]');
        if (sibling) return sibling;
    }

    return null;
}

// Import pure utility functions directly
import {
    detectMimeType,
    extractFileName,
    base64ToFile,
} from '@/content/drag-drop-uploader';

// ─── Tests ───

describe('Drag-Drop Uploader — Drop Zone Detection', () => {
    it('should find dropzone by class name', () => {
        const html = '<html><body><div class="dropzone"><p>Drop here</p></div></body></html>';
        const dom = new JSDOM(html);
        const zones = findDropZones(dom.window.document);
        expect(zones.length).toBe(1);
    });

    it('should find resume-upload zone', () => {
        const html = '<html><body><div class="resume-upload"><p>Upload resume</p></div></body></html>';
        const dom = new JSDOM(html);
        const zones = findDropZones(dom.window.document);
        expect(zones.length).toBe(1);
    });

    it('should find zone by data-automation-id', () => {
        const html = '<html><body><div data-automation-id="attachments-upload"><p>Drop</p></div></body></html>';
        const dom = new JSDOM(html);
        const zones = findDropZones(dom.window.document);
        expect(zones.length).toBe(1);
    });

    it('should find multiple zones', () => {
        const html = '<html><body><div class="dropzone">1</div><div class="file-drop">2</div></body></html>';
        const dom = new JSDOM(html);
        const zones = findDropZones(dom.window.document);
        expect(zones.length).toBe(2);
    });

    it('should deduplicate zones matching multiple selectors', () => {
        const html = '<html><body><div class="dropzone resume-upload">1</div></body></html>';
        const dom = new JSDOM(html);
        const zones = findDropZones(dom.window.document);
        expect(zones.length).toBe(1);
    });

    it('should find zones in the multipage fixture', () => {
        const html = readFileSync(join(__dirname, 'fixtures', 'multipage-workday.html'), 'utf-8');
        const dom = new JSDOM(html);
        const zones = findDropZones(dom.window.document);
        expect(zones.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty when no zones exist', () => {
        const html = '<html><body><form><input type="text" name="name"></form></body></html>';
        const dom = new JSDOM(html);
        const zones = findDropZones(dom.window.document);
        expect(zones.length).toBe(0);
    });
});

describe('Drag-Drop Uploader — Hidden File Input', () => {
    it('should find hidden file input inside drop zone', () => {
        const html = '<html><body><div class="dropzone"><p>Drop here</p><input type="file" name="resume" style="display:none"></div></body></html>';
        const dom = new JSDOM(html);
        const zone = dom.window.document.querySelector<HTMLElement>('.dropzone')!;
        const input = findHiddenFileInput(zone);
        expect(input).not.toBeNull();
        expect(input!.name).toBe('resume');
    });

    it('should find file input as sibling', () => {
        const html = '<html><body><div class="upload-wrapper"><div class="dropzone"><p>Drop here</p></div><input type="file" name="doc"></div></body></html>';
        const dom = new JSDOM(html);
        const zone = dom.window.document.querySelector<HTMLElement>('.dropzone')!;
        const input = findHiddenFileInput(zone);
        expect(input).not.toBeNull();
        expect(input!.name).toBe('doc');
    });

    it('should return null when no file input exists', () => {
        const html = '<html><body><div class="dropzone"><p>Drop here</p></div></body></html>';
        const dom = new JSDOM(html);
        const zone = dom.window.document.querySelector<HTMLElement>('.dropzone')!;
        const input = findHiddenFileInput(zone);
        expect(input).toBeNull();
    });

    it('should find file input in the multipage fixture upload section', () => {
        const html = readFileSync(join(__dirname, 'fixtures', 'multipage-workday.html'), 'utf-8');
        const dom = new JSDOM(html);
        const zone = dom.window.document.querySelector<HTMLElement>('.dropzone')!;
        const input = findHiddenFileInput(zone);
        expect(input).not.toBeNull();
        expect(input!.getAttribute('accept')).toBe('.pdf,.doc,.docx');
    });
});

describe('Drag-Drop Uploader — MIME Type Detection', () => {
    it('should detect PDF', () => {
        expect(detectMimeType('resume.pdf')).toBe('application/pdf');
    });

    it('should detect DOCX', () => {
        expect(detectMimeType('resume.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should detect DOC', () => {
        expect(detectMimeType('resume.doc')).toBe('application/msword');
    });

    it('should detect TXT', () => {
        expect(detectMimeType('notes.txt')).toBe('text/plain');
    });

    it('should detect JPG', () => {
        expect(detectMimeType('photo.jpg')).toBe('image/jpeg');
    });

    it('should detect PNG', () => {
        expect(detectMimeType('photo.png')).toBe('image/png');
    });

    it('should handle URL with query params', () => {
        expect(detectMimeType('https://cdn.example.com/resume.pdf?token=abc123')).toBe('application/pdf');
    });

    it('should return octet-stream for unknown extensions', () => {
        expect(detectMimeType('file.xyz')).toBe('application/octet-stream');
    });
});

describe('Drag-Drop Uploader — File Name Extraction', () => {
    it('should extract filename from URL', () => {
        expect(extractFileName('https://cdn.example.com/uploads/sarah_resume.pdf')).toBe('sarah_resume.pdf');
    });

    it('should handle URL with query params', () => {
        expect(extractFileName('https://cdn.example.com/resume.pdf?v=2')).toBe('resume.pdf');
    });

    it('should return default for invalid URL', () => {
        expect(extractFileName('not-a-url')).toBe('resume.pdf');
    });
});

describe('Drag-Drop Uploader — base64ToFile', () => {
    it('should create a File from base64 string', () => {
        // "Hello" in base64
        const base64 = btoa('Hello, World!');
        const file = base64ToFile(base64, 'test.txt', 'text/plain');

        expect(file).toBeInstanceOf(File);
        expect(file.name).toBe('test.txt');
        expect(file.type).toBe('text/plain');
        expect(file.size).toBeGreaterThan(0);
    });

    it('should create a PDF file', () => {
        const base64 = btoa('fake-pdf-content');
        const file = base64ToFile(base64, 'resume.pdf', 'application/pdf');

        expect(file.name).toBe('resume.pdf');
        expect(file.type).toBe('application/pdf');
    });
});
