import './globals.css';

import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

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

const faviconSvg =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22 fill=%22none%22%3E%3Crect x=%224%22 y=%224%22 width=%2256%22 height=%2256%22 rx=%2214%22 fill=%22%232563EB%22/%3E%3Cpath d=%22M22 19h8.5c5.4 0 9.5 3.5 9.5 9 0 5.7-4.2 9.2-9.7 9.2H26v7.8h-4V19Zm4 4v10.3h4.2c3.4 0 5.5-1.9 5.5-5.2 0-3.3-2.1-5.1-5.5-5.1H26Z%22 fill=%22white%22/%3E%3C/svg%3E';

export const metadata: Metadata = {
  title: 'Hatch',
  icons: {
    icon: faviconSvg,
    shortcut: faviconSvg,
    apple: faviconSvg,
    other: {
      rel: 'mask-icon',
      url: faviconSvg,
      color: '#2563EB'
    }
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable}`}>
      <body className="min-h-screen bg-gray-50 text-[var(--hatch-text)] antialiased">
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
