'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, Target, Users, Menu, X, Home, BarChart3, FileText, Settings, Mail, Activity, HeartPulse, Search } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Jobs', href: '/admin/jobs', icon: Briefcase },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'SEO Health', href: '/admin/seo-health', icon: Search },
  { name: 'Users & Subscribers', href: '/admin/users', icon: Users },
  { name: 'Employer Outreach', href: '/admin/outreach', icon: Target },
  { name: 'Email Broadcasts', href: '/admin/email', icon: Mail },
  { name: 'Blog', href: '/admin/blog', icon: FileText },
  { name: 'Job Health', href: '/admin/health', icon: HeartPulse },
  { name: 'Cron & Triggers', href: '/admin/cron', icon: Activity },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminSidebar({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F8' }}>
      {/* Mobile Header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50"
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E8ECF0',
          padding: '12px 16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center justify-between">
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', fontFamily: 'var(--font-lora), Georgia, serif' }}>
            Admin Panel
          </h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              padding: '8px',
              borderRadius: '12px',
              color: '#6B7F8A',
              background: '#F0F3F2',
              border: '1px solid rgba(255,255,255,0.5)',
              cursor: 'pointer',
              boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8)',
            }}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{
          width: '260px',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAF9 100%)',
          borderRight: '1px solid #E8ECF0',
          boxShadow: '4px 0 20px rgba(0,0,0,0.03)',
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            height: '68px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid #E8ECF0',
          }}
        >
          <Link href="/admin" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: 'linear-gradient(145deg, #0D9488, #0F766E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 1px 1px 3px rgba(255,255,255,0.2)',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '14px' }}>A</span>
            </div>
            <span style={{
              fontWeight: 700, fontSize: '16px', color: '#1A2E35',
              fontFamily: 'var(--font-lora), Georgia, serif',
            }}>
              Admin Panel
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item: typeof navItems[number]) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 16px',
                  borderRadius: '14px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 450,
                  transition: 'all 0.2s',
                  backgroundColor: active ? '#E6FAF8' : 'transparent',
                  color: active ? '#0D9488' : '#6B7F8A',
                  boxShadow: active
                    ? '4px 4px 10px rgba(13,148,136,0.08), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.6)'
                    : 'none',
                  border: active ? '1px solid rgba(13,148,136,0.12)' : '1px solid transparent',
                }}
              >
                <Icon size={19} style={{ color: active ? '#0D9488' : '#94A3B8', flexShrink: 0 }} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 12px',
            borderTop: '1px solid #E8ECF0',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '11px 16px',
              fontSize: '14px',
              color: '#6B7F8A',
              textDecoration: 'none',
              borderRadius: '14px',
              transition: 'all 0.2s',
              backgroundColor: '#F0F3F2',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '3px 3px 8px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.6)',
            }}
          >
            <Home size={18} style={{ color: '#0D9488' }} />
            Back to Site
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0">
        <div style={{ minHeight: '100vh' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
