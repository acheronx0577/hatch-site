import './globals.css';
import Link from 'next/link';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-satoshi'
});

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/search', label: 'Search' },
  { href: '/people', label: 'Pipeline' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/messages', label: 'Messaging' },
  { href: '/routing', label: 'Routing' },
  { href: '/journeys', label: 'Journeys' },
  { href: '/webhooks', label: 'Webhooks' },
  { href: '/tour-booker', label: 'Tour Booker' },
  { href: '/agreements/buyer-rep', label: 'BBA Wizard' },
  { href: '/mls/preflight', label: 'Publishing Check' },
  { href: '/cases', label: 'Cases' },
  { href: '/admin/audit', label: 'Audit' }
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable}`}>
      <body className="min-h-screen bg-[var(--hatch-surface)] text-[var(--hatch-text)] antialiased">
        <div className="relative flex min-h-screen flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[-1] h-[460px] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.25),transparent_55%)]" />
          <header className="sticky top-0 z-50 px-6 pt-6">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 rounded-3xl border border-white/15 bg-[var(--hatch-gradient)]/90 px-6 py-4 text-white shadow-[0_24px_60px_rgba(31,95,255,0.25)] backdrop-blur-[12px]">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-lg font-semibold leading-none text-white shadow-inner">
                  H
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/80">Hatch CRM</p>
                  <p className="text-xl font-semibold leading-tight text-white">Revenue Pipeline OS</p>
                </div>
              </div>
              <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-white/80">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 transition hover:border-white/20 hover:bg-white/20 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-6xl flex-1 px-6 pb-16 pt-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
