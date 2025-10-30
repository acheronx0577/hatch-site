'use client';

import { useMemo, useState } from 'react';

import { LayoutEditor } from '@/components/admin/layout-editor';

const OBJECT_OPTIONS = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'opportunities', label: 'Opportunities' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'leads', label: 'Leads' },
  { value: 'cases', label: 'Cases' }
];

const PROFILE_OPTIONS = [
  { value: undefined, label: 'Default' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
  { value: 'viewer', label: 'Viewer' }
];

export default function AdminLayoutsPage() {
  const [object, setObject] = useState<string>('accounts');
  const [kind, setKind] = useState<'detail' | 'list'>('list');
  const [profile, setProfile] = useState<string | undefined>(undefined);

  const profileOptionValue = useMemo(() => profile ?? '', [profile]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Layouts</h1>
        <p className="text-sm text-slate-600">
          Arrange fields for list and detail views. Layouts intersect with field-level security, so users never see fields they do not have access to.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-md border border-slate-200 bg-white p-4">
        <label className="flex flex-col text-sm font-medium text-slate-700">
          Object
          <select
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            value={object}
            onChange={(event) => setObject(event.target.value)}
          >
            {OBJECT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm font-medium text-slate-700">
          Layout type
          <select
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'detail' | 'list')}
          >
            <option value="list">List</option>
            <option value="detail">Detail</option>
          </select>
        </label>

        <label className="flex flex-col text-sm font-medium text-slate-700">
          Profile
          <select
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            value={profileOptionValue}
            onChange={(event) => {
              const value = event.target.value;
              setProfile(value === '' ? undefined : value);
            }}
          >
            {PROFILE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ''}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <LayoutEditor object={object} kind={kind} profile={profile} />
    </div>
  );
}
