import type { ReactNode } from 'react';

import { RulesTabs } from './nav-tabs';

export default function RulesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rules Engine</h1>
          <p className="text-sm text-slate-600">
            Configure lightweight validation and assignment across CRM objects.
          </p>
        </div>
        <RulesTabs />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">{children}</div>
    </div>
  );
}
