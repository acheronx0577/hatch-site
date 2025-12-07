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
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22 fill=%22none%22%3E%3Cdefs%3E%3ClinearGradient id=%22grad%22 x1=%228%22 y1=%228%22 x2=%2256%22 y2=%2256%22 gradientUnits=%22userSpaceOnUse%22%3E%3Cstop stop-color=%22%232CD4C6%22/%3E%3Cstop offset=%221%22 stop-color=%22%232563EB%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x=%224%22 y=%224%22 width=%2256%22 height=%2256%22 rx=%2216%22 fill=%22url(%23grad)%22/%3E%3Cpath fill=%22white%22 d=%22M20 16h6v14h12V16h6v32h-6V34H26v14h-6V16Z%22/%3E%3C/svg%3E';

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
