'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const TABS = [
  { name: 'Validation', href: '/admin/rules/validation' },
  { name: 'Assignment', href: '/admin/rules/assignment' }
] as const;

export function RulesTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 text-sm">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              'rounded-t px-3 py-2 font-medium transition',
              active
                ? 'border border-b-white border-slate-200 bg-white text-brand-600 shadow-sm'
                : 'text-slate-600 hover:text-brand-600'
            )}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}
