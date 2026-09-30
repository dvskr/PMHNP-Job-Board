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
        // Raised from the 5s default. Whichever test in a file first does
        // `await import` of an API route pays the cold cost of that route's
        // whole module graph, which measures anywhere from 5 to 12 seconds on
        // this repo depending on machine load. Two files have already failed
        // on it while asserting something that passes instantly once warm, so
        // the timeout was measuring the import, not the assertion, and those
        // failures were a function of how busy the machine was.
        //
        // A genuinely hung test now takes 30s to report instead of 5s, which
        // is a fair trade against a suite that cannot be trusted when the
        // laptop is busy.
        testTimeout: 30_000,
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
