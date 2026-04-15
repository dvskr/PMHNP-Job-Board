import Link from 'next/link';
import Image from 'next/image';
import { Search, Home, Briefcase, ChevronRight } from 'lucide-react';

/* ═══ Clay Tokens ═══ */
const clayShadow = '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';
const clayCard = {
    background: '#FFFFFF',
    borderRadius: '24px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: clayShadow,
    overflow: 'hidden' as const,
};

export default function NotFound() {
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
            
            {/* 404 Hero Card */}
            <div style={{
                ...clayCard,
                position: 'relative',
                padding: '50px 40px',
                textAlign: 'center',
                background: 'linear-gradient(145deg, #FFFFFF, #F8FAFC)',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #0D9488, #2DD4BF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    fontSize: '120px',
                    fontWeight: 900,
                    lineHeight: '1',
                    marginBottom: '20px',
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    letterSpacing: '-4px',
                    filter: 'drop-shadow(3px 3px 6px rgba(13, 148, 136, 0.15))'
                }}>
                    404
                </div>

                <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                    We lost the signal.
                </h1>
                
                <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 30px' }}>
                    The page you are trying to access doesn&apos;t seem to exist or has been permanently moved to a new route.
                </p>

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/jobs" className="clay-btn-primary" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#FFFFFF',
                        background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                        boxShadow: '0 4px 12px rgba(13,148,136,0.3), inset 1px 1px 3px rgba(255,255,255,0.3)',
                        textDecoration: 'none', transition: 'all 0.2s ease'
                    }}>
                        <Briefcase size={18} />
                        Find PMHNP Jobs
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
                        Return Home
                    </Link>
                </div>
            </div>

            {/* Quick Suggestions Bento */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                <Link href="/for-job-seekers" style={{
                    ...clayCard,
                    padding: '24px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    textDecoration: 'none', transition: 'all 0.2s ease',
                    cursor: 'pointer'
                }} className="clay-link-card">
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #E0F2FE, #BAE6FD)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.8), 2px 2px 6px rgba(0,0,0,0.04)'
                    }}>
                        <Search size={20} color="#0284C7" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Job Seekers</h3>
                        <p style={{ fontSize: '13px', color: '#64748B' }}>Discover career resources</p>
                    </div>
                    <ChevronRight size={18} color="#94A3B8" />
                </Link>

                <Link href="/for-employers" style={{
                    ...clayCard,
                    padding: '24px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    textDecoration: 'none', transition: 'all 0.2s ease',
                    cursor: 'pointer'
                }} className="clay-link-card">
                     <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #F3E8FF, #E9D5FF)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.8), 2px 2px 6px rgba(0,0,0,0.04)'
                    }}>
                        <Briefcase size={20} color="#9333EA" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Employers</h3>
                        <p style={{ fontSize: '13px', color: '#64748B' }}>Hire top PMHNP talent</p>
                    </div>
                    <ChevronRight size={18} color="#94A3B8" />
                </Link>
            </div>
            
            <style>{`
                .clay-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(13,148,136,0.4), inset 1px 1px 4px rgba(255,255,255,0.4) !important;
                }
                .clay-btn-secondary:hover, .clay-link-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 6px 6px 14px rgba(0,0,0,0.06), -3px -3px 8px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.7) !important;
                }
            `}</style>
        </div>
    </main>
  );
}
