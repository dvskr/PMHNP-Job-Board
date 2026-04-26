/**
 * Next.js Instrumentation Hook
 * 
 * This runs at server startup BEFORE any API route modules are loaded.
 * We use it to polyfill browser globals (DOMMatrix, Path2D, ImageData)
 * that pdfjs-dist (used by pdf-parse) requires but aren't available in Node.js.
 */
;globalThis["__SENTRY_SERVER_MODULES__"] = {"@hookform/resolvers":"^5.2.2","@paralleldrive/cuid2":"^3.0.4","@phosphor-icons/react":"^2.1.10","@prisma/adapter-pg":"^7.4.1","@prisma/client":"^7.4.1","@react-pdf/renderer":"^4.3.1","@resvg/resvg-js":"^2.6.2","@supabase/ssr":"^0.8.0","@supabase/supabase-js":"^2.88.0","@tailwindcss/typography":"^0.5.19","@types/web-push":"^3.6.4","@upstash/ratelimit":"^2.0.8","@upstash/redis":"^1.36.2","@vercel/og":"^0.8.6","@vercel/speed-insights":"^2.0.0","class-variance-authority":"^0.7.1","clsx":"^2.1.1","date-fns":"^4.1.0","dotenv":"^17.2.3","framer-motion":"^12.34.0","gray-matter":"^4.0.3","jose":"^6.1.3","lucide-react":"^0.555.0","mammoth":"^1.12.0","next":"^16.0.10","next-mdx-remote":"^6.0.0","openai":"^6.32.0","pdf-parse":"^2.4.5","pg":"^8.16.3","playwright":"^1.58.2","react":"19.2.0","react-dom":"19.2.0","react-hook-form":"^7.67.0","react-quill-new":"^3.8.3","react-simple-maps":"^3.0.0","resend":"^6.5.2","sanitize-html":"^2.17.0","satori":"^0.19.2","stripe":"^20.0.0","tailwind-merge":"^3.4.0","web-push":"^3.6.7","zod":"^4.1.13","@next/bundle-analyzer":"^16.1.1","@playwright/test":"^1.58.2","@tailwindcss/postcss":"^4","@types/node":"^20","@types/pg":"^8.15.6","@types/react":"^19","@types/react-dom":"^19","@types/sanitize-html":"^2.16.0","@types/sharp":"^0.31.1","@types/uuid":"^10.0.0","@vitejs/plugin-react":"^4.3.4","@vitest/coverage-v8":"^2.1.8","eslint":"^9","eslint-config-next":"16.0.7","prisma":"^7.4.1","sharp":"^0.34.5","tailwindcss":"^4","ts-node":"^10.9.2","tsconfig-paths":"^4.2.0","typescript":"^5","vitest":"^2.1.8"};globalThis["_sentryNextJsVersion"] = "16.1.6";globalThis["_sentryRewritesTunnelPath"] = "/monitoring";export async function register() {
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
