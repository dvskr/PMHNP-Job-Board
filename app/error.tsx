'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Briefcase, RefreshCw, AlertTriangle } from 'lucide-react';

/* ═══ Clay Tokens ═══ */
const clayShadow = '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';
const clayCard = {
    background: '#FFFFFF',
    borderRadius: '24px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: clayShadow,
    overflow: 'hidden' as const,
};

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Application error boundary triggered:', error);
  }, [error]);

  return (
    <main style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        fontFamily: 'var(--font-inter), system-ui, sans-serif'
    }}>
        <div style={{ maxWidth: '640px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Main Error Node */}
            <div style={{
                ...clayCard,
                position: 'relative',
                padding: '50px 40px',
                textAlign: 'center',
                background: 'linear-gradient(145deg, #FFFFFF, #FFF1F2)',
            }}>
                <div style={{
                    width: '72px', height: '72px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #FECDD3, #FDA4AF)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.8), 2px 2px 8px rgba(225,29,72,0.15)',
                    margin: '0 auto 24px'
                }}>
                    <AlertTriangle size={36} color="#E11D48" />
                </div>

                <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                    Something went wrong
                </h1>

                <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 30px' }}>
                    The page hit an error. Try again, or head back to the job board.
                </p>

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={reset} className="clay-btn-primary" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#FFFFFF',
                        background: 'linear-gradient(135deg, #E11D48, #BE123C)',
                        boxShadow: '0 4px 12px rgba(225,29,72,0.3), inset 1px 1px 3px rgba(255,255,255,0.3)',
                        border: 'none', cursor: 'pointer', transition: 'all 0.2s ease'
                    }}>
                        <RefreshCw size={18} />
                        Try again
                    </button>
                    <Link href="/jobs" className="clay-btn-secondary" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#334155',
                        background: '#FFFFFF',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '4px 4px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.7)',
                        textDecoration: 'none', transition: 'all 0.2s ease'
                    }}>
                        <Briefcase size={18} />
                        Browse jobs
                    </Link>
                </div>
            </div>

            {/* Developer Diagnostics (Hidden in Prod usually, but stylized just in case) */}
            {process.env.NODE_ENV === 'development' && (
                <div style={{
                    ...clayCard,
                    padding: '24px',
                    background: '#FFF5F5',
                    border: '1px solid #FECACA',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.8)'
                }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#991B1B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Error details (development only)
                    </h3>
                    <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: '12px', border: '1px dashed #FCA5A5' }}>
                        <p style={{ fontSize: '13px', fontFamily: 'monospace', color: '#B91C1C', wordBreak: 'break-all' }}>
                            {error.message}
                        </p>
                        {error.digest && (
                            <p style={{ fontSize: '11px', fontFamily: 'monospace', color: '#DC2626', marginTop: '12px', opacity: 0.8 }}>
                                DIGEST: {error.digest}
                            </p>
                        )}
                    </div>
                </div>
            )}

            
            <style>{`
                .clay-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(225,29,72,0.4), inset 1px 1px 4px rgba(255,255,255,0.4) !important;
                }
                .clay-btn-secondary:hover {
                    transform: translateY(-2px);
                    box-shadow: 6px 6px 14px rgba(0,0,0,0.06), -3px -3px 8px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.7) !important;
                }
            `}</style>
        </div>
    </main>
  );
}
