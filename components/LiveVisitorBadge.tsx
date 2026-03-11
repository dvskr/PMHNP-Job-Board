'use client';

import { useState, useEffect } from 'react';

/**
 * B3: Live visitor count badge
 * Shows "X people browsing right now" using a deterministic pseudorandom count
 * based on hour-of-day with small random variation.
 */
export default function LiveVisitorBadge() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const hour = new Date().getHours();
        // Peak hours 9am-9pm get higher counts
        const baseCounts: Record<number, number> = {
            0: 42, 1: 35, 2: 28, 3: 25, 4: 30, 5: 38,
            6: 55, 7: 72, 8: 95, 9: 128, 10: 152, 11: 168,
            12: 175, 13: 162, 14: 155, 15: 148, 16: 138,
            17: 125, 18: 115, 19: 108, 20: 92, 21: 78, 22: 62, 23: 50,
        };
        const base = baseCounts[hour] || 80;
        // Add some random variation (±15%)
        const variation = Math.floor(base * 0.15 * (Math.random() * 2 - 1));
        setCount(base + variation);
    }, []);

    if (count === 0) return null;

    return (
        <span
            className="inline-flex items-center gap-2 text-[12px] font-medium"
            style={{ color: 'var(--text-muted)' }}
        >
            <span className="relative flex h-2 w-2">
                <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{
                        backgroundColor: '#ef4444',
                        animation: 'heroPing 1.4s ease-in-out infinite',
                    }}
                />
                <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: '#ef4444' }}
                />
            </span>
            {count} people browsing right now
        </span>
    );
}
