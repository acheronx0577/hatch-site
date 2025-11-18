import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/people', label: 'People' },
  { href: '/tour-booker', label: 'Tour Booker' },
  { href: '/agreements/buyer-rep', label: 'BBA Wizard' },
  { href: '/mls/preflight', label: 'Publishing Check' }
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 border-b border-slate-200 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xl font-semibold text-brand-700">Hatch CRM</div>
            <nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-600 sm:gap-4">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-brand-600">
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="flex-1 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
