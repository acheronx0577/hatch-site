import './globals.css';

import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';

import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/toaster';

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

const faviconPng = '/Hatch Icon.jpg';

export const metadata: Metadata = {
  title: 'Hatch',
  icons: {
    icon: faviconPng,
    shortcut: faviconPng
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable}`}>
      <body className="min-h-screen bg-gray-50 text-[var(--hatch-text)] antialiased">
        <AppShell>{children}</AppShell>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
