import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
    manifest_version: 3,
    name: 'PMHNP Hiring — Autofill Agent',
    description:
        'Autofill PMHNP job applications in seconds. Built for Psychiatric Mental Health Nurse Practitioners.',
    version: '1.0.0',
    permissions: ['activeTab', 'storage', 'tabs', 'scripting', 'alarms', 'sidePanel', 'webNavigation'],
    host_permissions: [
        'https://pmhnphiring.com/*',
        'https://www.pmhnphiring.com/*',
        'http://localhost:3000/*',
        '<all_urls>',
    ],
    background: {
        service_worker: 'src/background/index.ts',
        type: 'module',
    },
    content_scripts: [
        {
            matches: ['<all_urls>'],
            js: ['src/content/index.ts'],
            run_at: 'document_idle',
            all_frames: true,
            match_about_blank: true,
        },
    ],
    action: {
        default_popup: 'src/popup/index.html',
        default_icon: {
            '16': 'public/icons/icon-16.png',
            '32': 'public/icons/icon-32.png',
            '48': 'public/icons/icon-48.png',
            '128': 'public/icons/icon-128.png',
        },
    },
    side_panel: {
        default_path: 'src/sidebar/index.html',
    },
    icons: {
        '16': 'public/icons/icon-16.png',
        '32': 'public/icons/icon-32.png',
        '48': 'public/icons/icon-48.png',
        '128': 'public/icons/icon-128.png',
    },
});
