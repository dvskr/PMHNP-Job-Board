import Link from 'next/link';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';

/* ═══ Clay Tokens ═══ */
const clayShadow = '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';
const clayCard = {
    background: '#FFFFFF',
    borderRadius: '24px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: clayShadow,
    overflow: 'hidden' as const,
};

export const metadata = {
  title: 'Unauthorized Access | PMHNP Hiring',
};

export default function UnauthorizedPage() {
  return (
    <main style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        fontFamily: 'var(--font-inter), system-ui, sans-serif'
    }}>
        <div style={{ maxWidth: '640px', width: '100%', display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* 401/403 Card */}
            <div style={{
                ...clayCard,
                position: 'relative',
                padding: '50px 40px',
                textAlign: 'center',
                background: 'linear-gradient(145deg, #FFFFFF, #F8FAFC)',
            }}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '24px',
                    background: 'linear-gradient(135deg, #FEF2F2, #FEE2E2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.8), 2px 2px 8px rgba(239,68,68,0.15)',
                    margin: '0 auto 24px',
                }}>
                    <ShieldAlert size={40} color="#EF4444" />
                </div>

                <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                    Access Restricted
                </h1>
                
                <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 30px' }}>
                    You don't have the necessary clearance or active permissions to view this resource.
                </p>

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/dashboard" className="clay-btn-primary" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#FFFFFF',
                        background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                        boxShadow: '0 4px 12px rgba(13,148,136,0.3), inset 1px 1px 3px rgba(255,255,255,0.3)',
                        textDecoration: 'none', transition: 'all 0.2s ease'
                    }}>
                        <ArrowLeft size={18} />
                        Return to Dashboard
                    </Link>
                    <Link href="/" className="clay-btn-secondary" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#334155',
                        background: '#FFFFFF',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '4px 4px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.7)',
                        textDecoration: 'none', transition: 'all 0.2s ease'
                    }}>
                        <Home size={18} />
                        Go Config Home
                    </Link>
                </div>
            </div>

            <style>{`
                .clay-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(13,148,136,0.4), inset 1px 1px 4px rgba(255,255,255,0.4) !important;
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
