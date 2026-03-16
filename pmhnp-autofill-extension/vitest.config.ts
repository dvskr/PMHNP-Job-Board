import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
});
