import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Quote, Star } from 'lucide-react';

/**
 * EmployerTestimonials — server component.
 *
 * Renders up to three admin-featured, explicitly-consented employer
 * testimonials as clay quote cards. Renders nothing at all (null) when no
 * testimonial has been featured yet, so pages never show an empty shell.
 *
 * Consent + featuring flow: employers opt in via the "Share Your Story"
 * form (consent checkbox + display preference), then an admin features the
 * testimonial from /admin/testimonials. Only consent=true AND featuredAt
 * set rows ever reach the public site.
 */

/* ═══ Clay tokens — matched to pricing / employer pages ═══ */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

interface FeaturedTestimonial {
    id: string;
    employerName: string;
    content: string;
    rating: number | null;
    displayAs: string;
}

/**
 * Maps the employer's chosen display preference to the attribution shown
 * publicly. 'initial' shows the first word plus the next word's initial
 * (e.g. "Jane Doe" -> "Jane D."), and 'anonymous' hides the name entirely.
 */
function formatAttribution(employerName: string, displayAs: string): string {
    if (displayAs === 'full') return employerName;
    if (displayAs === 'anonymous') return 'Hiring manager';
    // 'initial' (default)
    const parts = employerName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Hiring manager';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

function StarRating({ rating }: { rating: number }) {
    const clamped = Math.max(1, Math.min(5, rating));
    return (
        <div style={{ display: 'flex', gap: '3px' }} aria-label={`Rated ${clamped} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <Star
                    key={i}
                    size={15}
                    fill={i <= clamped ? '#F59E0B' : 'none'}
                    style={{ color: i <= clamped ? '#F59E0B' : '#E2E8F0' }}
                />
            ))}
        </div>
    );
}

export default async function EmployerTestimonials() {
    let testimonials: FeaturedTestimonial[] = [];
    try {
        testimonials = await prisma.employerTestimonial.findMany({
            where: { consent: true, featuredAt: { not: null } },
            orderBy: { featuredAt: 'desc' },
            take: 3,
            select: {
                id: true,
                employerName: true,
                content: true,
                rating: true,
                displayAs: true,
            },
        });
    } catch (error) {
        // A marketing section must never take the page down — log and hide.
        logger.error('[EmployerTestimonials] failed to load featured testimonials', error);
        return null;
    }

    if (testimonials.length === 0) return null;

    return (
        <section aria-labelledby="employer-testimonials-heading" style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 20px 0' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                Employer Stories
            </p>
            <h2 id="employer-testimonials-heading" className="font-lora" style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
                What Employers Say
            </h2>
            <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 36px', lineHeight: 1.6 }}>
                Real feedback from employers who have hired here, shared with their permission.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {testimonials.map((t) => (
                    <figure key={t.id} style={{ ...clayCard, margin: 0, padding: '28px 26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{
                                width: '34px', height: '34px', borderRadius: '10px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'linear-gradient(145deg, #0D9488, #10B981)',
                                boxShadow: '2px 2px 5px rgba(13,148,136,0.12)',
                                flexShrink: 0,
                            }}>
                                <Quote size={16} color="#fff" />
                            </div>
                            {t.rating !== null && <StarRating rating={t.rating} />}
                        </div>
                        <blockquote style={{ margin: 0, fontSize: '14px', color: '#5A4A42', lineHeight: 1.65, flex: 1 }}>
                            &ldquo;{t.content}&rdquo;
                        </blockquote>
                        <figcaption style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>
                            — {formatAttribution(t.employerName, t.displayAs)}
                        </figcaption>
                    </figure>
                ))}
            </div>
        </section>
    );
}
