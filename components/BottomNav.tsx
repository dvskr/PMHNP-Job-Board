'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Briefcase, Bookmark, Bell } from 'lucide-react';

const navItems = [
  {
    label: 'Home',
    href: '/',
    icon: Home,
  },
  {
    label: 'Jobs',
    href: '/jobs',
    icon: Briefcase,
  },
  {
    label: 'Saved',
    href: '/saved',
    icon: Bookmark,
  },
  {
    label: 'Alerts',
    href: '/job-alerts/manage',
    icon: Bell,
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      // Exact match for home
      return pathname === '/';
    }
    // Prefix match for other routes
    return pathname.startsWith(href);
  };

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 shadow-lg safe-bottom"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-color)',
        }}
      >
        <div className="flex items-center justify-around px-2 py-2 pb-safe">
          {navItems.map((item: typeof navItems[number]) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-lg transition-all touch-manipulation`}
                style={{
                  backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                }}
              >
                <Icon
                  className="w-6 h-6 mb-1 transition-colors"
                  style={{
                    color: active ? 'var(--color-primary)' : 'var(--text-tertiary)',
                  }}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className="text-xs font-medium transition-colors"
                  style={{
                    color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
