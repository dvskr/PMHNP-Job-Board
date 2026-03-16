import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SOURCE_IMAGE = path.join(process.cwd(), 'public', 'logo.png');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

const CONFIG = [
    { name: 'android-chrome-192x192.png', width: 192, height: 192 },
    { name: 'android-chrome-512x512.png', width: 512, height: 512 },
    { name: 'apple-touch-icon.png', width: 180, height: 180 },
    { name: 'favicon-16x16.png', width: 16, height: 16 },
    { name: 'favicon-32x32.png', width: 32, height: 32 },
];

async function generateIcons() {
    if (!fs.existsSync(SOURCE_IMAGE)) {
        console.error(`Source image not found at ${SOURCE_IMAGE}`);
        process.exit(1);
    }

    console.log(`Generating icons from ${SOURCE_IMAGE}...`);

    for (const icon of CONFIG) {
        const outputPath = path.join(PUBLIC_DIR, icon.name);

        try {
            await sharp(SOURCE_IMAGE)
                .trim() // Remove transparent whitespace around the logo
                .resize({
                    width: icon.width,
                    height: icon.height,
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                })
                .toFile(outputPath);

            console.log(`✔ Generated ${icon.name} (${icon.width}x${icon.height})`);
        } catch (error) {
            console.error(`✘ Failed to generate ${icon.name}:`, error);
        }
    }
}

generateIcons();
