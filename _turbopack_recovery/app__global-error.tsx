'use client';

import { useEffect } from 'react';

/* â•â•â• Clay Tokens â•â•â• */
const clayShadow = '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';
const clayCard = {
    background: '#FFFFFF',
    borderRadius: '24px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: clayShadow,
    overflow: 'hidden' as const,
};

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: 'linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%)' }}>
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
        }}>
          <div style={{ maxWidth: '640px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{
                ...clayCard,
                position: 'relative',
                padding: '50px 40px',
                textAlign: 'center',
                background: 'linear-gradient(145deg, #FFFFFF, #FFF1F2)',
            }}>
                <div style={{
                    width: '72px', height: '72px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.8), 2px 2px 8px rgba(217,119,6,0.15)',
                    margin: '0 auto 24px',
                    fontSize: '32px'
                }}>
                    âš ï¸
                </div>

                <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                    Critical Global Failure
                </h1>
                
                <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 30px' }}>
                    The application root encountered an unrecoverable exception.
                </p>

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={reset} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#FFFFFF',
                        background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                        boxShadow: '0 4px 12px rgba(13,148,136,0.3), inset 1px 1px 3px rgba(255,255,255,0.3)',
                        border: 'none', cursor: 'pointer', transition: 'all 0.2s ease'
                    }}>
                        â†» Restart Engine
                    </button>
                    <button onClick={() => window.location.href = '/'} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#334155',
                        background: '#FFFFFF',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '4px 4px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.7)',
                        cursor: 'pointer', transition: 'all 0.2s ease'
                    }}>
                        ðŸ  Return Home
                    </button>
                </div>
            </div>

            {process.env.NODE_ENV === 'development' && (
                <div style={{
                    ...clayCard,
                    padding: '24px',
                    background: '#FFF5F5',
                    border: '1px solid #FECACA',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.8)',
                    textAlign: 'left'
                }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#991B1B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Stack Trace
                    </h3>
                    <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: '12px', border: '1px dashed #FCA5A5' }}>
                        <p style={{ fontSize: '13px', fontFamily: 'monospace', color: '#B91C1C', wordBreak: 'break-all', margin: 0 }}>
                            {error.message}
                        </p>
                        {error.digest && (
                            <p style={{ fontSize: '11px', fontFamily: 'monospace', color: '#DC2626', marginTop: '12px', opacity: 0.8, margin: '12px 0 0 0' }}>
                                DIGEST: {error.digest}
                            </p>
                        )}
                    </div>
                </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
