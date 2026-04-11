'use client';

import { usePathname } from 'next/navigation';
import {
    XLogo,
    FacebookLogo,
    InstagramLogo,
    LinkedinLogo,
    YoutubeLogo,
} from '@phosphor-icons/react';

const PEBBLE_SHAPES = [
    '54% 46% 62% 38% / 49% 55% 45% 51%',
    '61% 39% 45% 55% / 40% 62% 38% 60%',
    '42% 58% 55% 45% / 58% 42% 60% 40%',
    '67% 33% 48% 52% / 45% 58% 42% 55%',
    '50% 50% 60% 40% / 55% 45% 52% 48%',
];

const PEBBLE_COLORS = ['#6ee7b7', '#5eead4', '#67e8f9', '#a5b4fc', '#c4b5fd'];

const socialLinks = [
    { icon: XLogo, href: 'https://x.com/pmhnphiring', label: 'X' },
    { icon: FacebookLogo, href: 'https://www.facebook.com/pmhnphiring', label: 'Facebook' },
    { icon: InstagramLogo, href: 'https://www.instagram.com/pmhnphiring', label: 'Instagram' },
    { icon: LinkedinLogo, href: 'https://www.linkedin.com/company/pmhnpjobs', label: 'LinkedIn' },
    { icon: YoutubeLogo, href: 'https://www.youtube.com/@pmhnphiring', label: 'YouTube' },
];

export default function FloatingSocial() {
    const pathname = usePathname();
    if (pathname !== '/') return null;

    return (
        <div className="fixed right-7 bottom-0 flex-col items-center gap-4 z-50 hidden xl:flex">
            {socialLinks.map((s, i) => {
                const Icon = s.icon;
                const color = PEBBLE_COLORS[i];
                const shape = PEBBLE_SHAPES[i];
                return (
                    <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={s.label}
                        className="flex items-center justify-center"
                        style={{
                            width: 42,
                            height: 38,
                            background: `linear-gradient(145deg, ${color}cc, ${color}88)`,
                            borderRadius: shape,
                            boxShadow:
                                'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.08)',
                            transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px) scale(1.12)';
                            e.currentTarget.style.boxShadow =
                                'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.14)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow =
                                'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.08)';
                        }}
                    >
                        <Icon size={18} weight="fill" className="text-slate-600/70" />
                    </a>
                );
            })}
            {/* Vertical line */}
            <div className="w-px h-20 bg-teal-300/40" />
        </div>
    );
}
