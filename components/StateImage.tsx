'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * Renders a state hero image from the Supabase `images/states/{slug}.webp`
 * bucket, falling back to a generic homepage hero if the per-state asset
 * is missing.
 *
 * Why: not every state slug in the codebase has a corresponding webp uploaded
 * to Supabase (notably `district-of-columbia.webp` was 404 at audit time).
 * Without a fallback, those tiles render as broken-image icons + cause CLS.
 *
 * Used in: app/jobs/locations/page.tsx, app/resources/page.tsx,
 * components/TopStatesList.tsx, components/LicensureChecker.tsx.
 */

const STATE_IMAGE_BASE = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/states';
// Verified 200 at audit time — used as the universal fallback so a single
// missing per-state asset doesn't cascade into a broken-image hit.
const FALLBACK_URL = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp';

type FillProps = {
    fill: true;
    width?: never;
    height?: never;
};
type FixedProps = {
    fill?: false;
    width: number;
    height: number;
};

type StateImageProps = (FillProps | FixedProps) & {
    slug: string;
    alt: string;
    className?: string;
    style?: React.CSSProperties;
    sizes?: string;
    loading?: 'eager' | 'lazy';
    priority?: boolean;
};

export default function StateImage(props: StateImageProps) {
    const { slug, alt, className, style, sizes, loading, priority } = props;
    const [src, setSrc] = useState(`${STATE_IMAGE_BASE}/${slug}.webp`);

    const handleError = () => {
        if (src !== FALLBACK_URL) setSrc(FALLBACK_URL);
    };

    if (props.fill) {
        return (
            <Image
                src={src}
                alt={alt}
                fill
                className={className}
                style={style}
                sizes={sizes}
                loading={loading}
                priority={priority}
                onError={handleError}
            />
        );
    }

    return (
        <Image
            src={src}
            alt={alt}
            width={props.width}
            height={props.height}
            className={className}
            style={style}
            sizes={sizes}
            loading={loading}
            priority={priority}
            onError={handleError}
        />
    );
}
