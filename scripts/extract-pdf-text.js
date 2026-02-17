/**
 * Standalone PDF text extraction script.
 * Runs OUTSIDE of Turbopack/Next.js to avoid DOMMatrix/Canvas polyfill issues.
 * 
 * Usage: node scripts/extract-pdf-text.js <url>
 * Output: PDF text to stdout
 */

const { PDFParse } = require('pdf-parse');

async function main() {
    const url = process.argv[2];
    if (!url) {
        process.stderr.write('Usage: node scripts/extract-pdf-text.js <url>\n');
        process.exit(1);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            process.stderr.write(`Fetch failed: ${response.status} ${response.statusText}\n`);
            process.exit(1);
        }

        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        if (data.length === 0) {
            process.stderr.write('Empty PDF buffer\n');
            process.exit(1);
        }

        const parser = new PDFParse({ data });
        const result = await parser.getText();
        const text = (result.text || '').substring(0, 6000);

        process.stdout.write(text);
        await parser.destroy().catch(() => { });
        process.exit(0);
    } catch (err) {
        process.stderr.write(`PDF parse error: ${err.message}\n`);
        process.exit(1);
    }
}

main();
