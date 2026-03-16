/**
 * Next.js Instrumentation Hook
 * 
 * This runs at server startup BEFORE any API route modules are loaded.
 * We use it to polyfill browser globals (DOMMatrix, Path2D, ImageData)
 * that pdfjs-dist (used by pdf-parse) requires but aren't available in Node.js.
 */
export async function register() {
    if (typeof globalThis.DOMMatrix === 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).DOMMatrix = class DOMMatrix {
            m11 = 1; m12 = 0; m13 = 0; m14 = 0;
            m21 = 0; m22 = 1; m23 = 0; m24 = 0;
            m31 = 0; m32 = 0; m33 = 1; m34 = 0;
            m41 = 0; m42 = 0; m43 = 0; m44 = 1;
            a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
            is2D = true;
            isIdentity = true;
            inverse() { return new DOMMatrix(); }
            multiply() { return new DOMMatrix(); }
            translate() { return new DOMMatrix(); }
            scale() { return new DOMMatrix(); }
            rotate() { return new DOMMatrix(); }
            transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
        };
    }
    if (typeof globalThis.Path2D === 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Path2D = class Path2D {
            addPath() { }
            closePath() { }
            moveTo() { }
            lineTo() { }
            bezierCurveTo() { }
            quadraticCurveTo() { }
            arc() { }
            arcTo() { }
            rect() { }
        };
    }
    if (typeof globalThis.ImageData === 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).ImageData = class ImageData {
            data: Uint8ClampedArray;
            width: number;
            height: number;
            constructor(w: number = 1, h: number = 1) {
                this.width = w;
                this.height = h;
                this.data = new Uint8ClampedArray(w * h * 4);
            }
        };
    }

    console.log('[instrumentation] Browser globals polyfilled for pdf-parse compatibility');
}
