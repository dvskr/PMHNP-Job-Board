import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.ts'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'tests/',
                '*.config.*',
                '.next/',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
