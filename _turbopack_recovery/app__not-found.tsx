import Link from 'next/link';
import { Search, Home, Briefcase, ChevronRight } from 'lucide-react';

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
                background: 'linear-gradient(145deg, #FFFFFF, #F8FAFC)',
                borderRadius: '24px',
                border: '1px solid rgba(0,0,0,0.06)',
                boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
                overflow: 'hidden',
                padding: '50px 40px',
                textAlign: 'center' as const,
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #0D9488, #2DD4BF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    fontSize: '120px',
                    fontWeight: 900,
                    lineHeight: '1',
                    marginBottom: '20px',
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    letterSpacing: '-4px',
                }}>
                    404
                </div>

                <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                    Page Not Found
                </h1>
                
                <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 30px' }}>
                    The page you are trying to access doesn&apos;t exist or has been permanently moved.
                </p>

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/jobs" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#FFFFFF',
                        background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                        boxShadow: '0 4px 12px rgba(13,148,136,0.3), inset 1px 1px 3px rgba(255,255,255,0.3)',
                        textDecoration: 'none',
                    }}>
                        <Briefcase size={18} />
                        Find PMHNP Jobs
                    </Link>
                    <Link href="/" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '16px',
                        fontSize: '15px', fontWeight: 600, color: '#334155',
                        background: '#FFFFFF',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '4px 4px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.7)',
                        textDecoration: 'none',
                    }}>
                        <Home size={18} />
                        Return Home
                    </Link>
                </div>
            </div>

            {/* Quick Suggestions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                <Link href="/for-job-seekers" style={{
                    background: '#FFFFFF',
                    borderRadius: '24px',
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
                    padding: '24px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    textDecoration: 'none',
                }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #E0F2FE, #BAE6FD)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Search size={20} color="#0284C7" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Job Seekers</h3>
                        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>Discover career resources</p>
                    </div>
                    <ChevronRight size={18} color="#94A3B8" />
                </Link>

                <Link href="/for-employers" style={{
                    background: '#FFFFFF',
                    borderRadius: '24px',
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
                    padding: '24px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    textDecoration: 'none',
                }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #F3E8FF, #E9D5FF)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Briefcase size={20} color="#9333EA" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Employers</h3>
                        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>Hire top PMHNP talent</p>
                    </div>
                    <ChevronRight size={18} color="#94A3B8" />
                </Link>
            </div>
        </div>
    </main>
  );
}
