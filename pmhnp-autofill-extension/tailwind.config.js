/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{ts,tsx,html}'],
    theme: {
        extend: {
            colors: {
                navy: {
                    DEFAULT: '#1a1a2e',
                    50: '#f0f0f5',
                    100: '#d8d8e5',
                    200: '#b1b1cb',
                    300: '#8a8ab1',
                    400: '#636397',
                    500: '#3c3c7d',
                    600: '#2d2d5f',
                    700: '#232349',
                    800: '#1a1a2e',
                    900: '#101020',
                    950: '#0a0a15',
                },
                teal: {
                    DEFAULT: '#00d4aa',
                    50: '#edfff9',
                    100: '#d2fff0',
                    200: '#a8ffe3',
                    300: '#6bffd1',
                    400: '#27f5b8',
                    500: '#00d4aa',
                    600: '#00b88e',
                    700: '#009373',
                    800: '#00745c',
                    900: '#005f4d',
                    950: '#00362d',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
