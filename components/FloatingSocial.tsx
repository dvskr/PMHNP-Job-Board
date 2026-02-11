'use client';

import { Twitter, Facebook, Instagram, Linkedin, AtSign } from 'lucide-react';
import { usePathname } from 'next/navigation';

const socialLinks = [
    { icon: Twitter, href: 'https://x.com/pmhnphiring', label: 'X' },
    { icon: Facebook, href: 'https://www.facebook.com/profile.php?id=61586136316931', label: 'Facebook' },
    { icon: Instagram, href: 'https://www.instagram.com/akarilabs.io/', label: 'Instagram' },
    { icon: Linkedin, href: 'https://www.linkedin.com/company/pmhnp-hiring', label: 'LinkedIn' },
    { icon: AtSign, href: 'https://www.threads.com/@akarilabs.io', label: 'Threads' },
];

export default function FloatingSocial() {
    const pathname = usePathname();
    if (pathname !== '/') return null;
    return (
        <>
            <div className="floating-social">
                {socialLinks.map((s) => {
                    const Icon = s.icon;
                    return (
                        <a
                            key={s.label}
                            href={s.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={s.label}
                            className="floating-social-icon"
                        >
                            <Icon size={20} strokeWidth={1.5} />
                        </a>
                    );
                })}

                {/* Vertical line below icons */}
                <div className="floating-social-line" />
            </div>

            <style>{`
                .floating-social {
                    position: fixed;
                    right: 28px;
                    bottom: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 20px;
                    z-index: 50;
                }
                .floating-social-icon {
                    color: var(--text-muted);
                    transition: all 0.2s;
                    text-decoration: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .floating-social-icon:hover {
                    color: var(--text-primary);
                    transform: translateY(-2px);
                }
                .floating-social-line {
                    width: 1px;
                    height: 80px;
                    background: var(--border-color);
                }
                @media (max-width: 768px) {
                    .floating-social {
                        display: none;
                    }
                }
            `}</style>
        </>
    );
}
