'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, Target, Users, Menu, X, ArrowLeft, Home } from 'lucide-react';

const navItems = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    name: 'Jobs',
    href: '/admin/jobs',
    icon: Briefcase,
  },
  {
    name: 'Users & Subscribers',
    href: '/admin/users',
    icon: Users,
  },
  {
    name: 'Employer Outreach',
    href: '/admin/outreach',
    icon: Target,
  },
];

export default function AdminSidebar({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Mobile Header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          padding: '12px 16px',
        }}
      >
        <div className="flex items-center justify-between">
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Admin Panel
          </h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              padding: '8px',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
        style={{
          width: '256px',
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-color)',
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <Link href="/admin" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '14px' }}>A</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
              Admin Panel
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                  padding: '12px 16px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.2s',
                  backgroundColor: active ? 'rgba(45, 212, 191, 0.1)' : 'transparent',
                  color: active ? '#2DD4BF' : 'var(--text-secondary)',
                  borderLeft: active ? '3px solid #2DD4BF' : '3px solid transparent',
                }}
              >
                <Icon size={20} style={{ color: active ? '#2DD4BF' : 'var(--text-tertiary)' }} />
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
            padding: '16px',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              borderRadius: '10px',
              transition: 'all 0.2s',
              backgroundColor: 'rgba(45, 212, 191, 0.05)',
              border: '1px solid rgba(45, 212, 191, 0.15)',
            }}
          >
            <Home size={18} style={{ color: '#2DD4BF' }} />
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
