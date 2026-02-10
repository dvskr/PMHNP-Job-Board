'use client';

import { useEffect, useRef, useState, useCallback, ReactNode, CSSProperties } from 'react';

interface ScrollRevealProps {
    children: ReactNode;
    /** Delay before animation starts (ms) */
    delay?: number;
    /** Custom inline styles for the wrapper */
    style?: CSSProperties;
    /** Custom class name */
    className?: string;
}

export default function ScrollReveal({ children, delay = 0, style, className }: ScrollRevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
        if (entries[0].isIntersecting) setVisible(true);
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(onIntersect, { threshold: 0.08 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [onIntersect]);

    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.6s ease-out ${delay}ms, transform 0.6s ease-out ${delay}ms`,
                ...style,
            }}
        >
            {children}
        </div>
    );
}
