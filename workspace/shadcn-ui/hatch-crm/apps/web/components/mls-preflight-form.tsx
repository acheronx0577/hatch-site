'use client';

import { useState } from 'react';

import { type MlsProfile, runPreflight } from '@/lib/api';

interface MlsPreflightFormProps {
  tenantId: string;
  profiles: Array<Pick<MlsProfile, 'id' | 'name' | 'disclaimerText'>>;
}

export default function MlsPreflightForm({ tenantId, profiles }: MlsPreflightFormProps) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [contentType, setContentType] = useState<'flyer' | 'email' | 'page'>('flyer');
  const [disclaimer, setDisclaimer] = useState(profiles[0]?.disclaimerText ?? '');
  const [showsComp, setShowsComp] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const result = await runPreflight({
        tenantId,
        mlsProfileId: profileId,
        contentType,
        fieldsJson: '{}',
        displayedDisclaimer: disclaimer,
        showsCompensation: showsComp
      });
      setStatus(result.pass ? 'Pass: compliant' : `Fail: ${result.violations.join(', ')}`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">MLS Profile</label>
        <select
          className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
          value={profileId}
          onChange={(event) => {
            const id = event.target.value;
            setProfileId(id);
            const profile = profiles.find((item) => item.id === id);
            if (profile) setDisclaimer(profile.disclaimerText);
          }}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="radio"
            name="contentType"
            value="flyer"
            checked={contentType === 'flyer'}
            onChange={() => setContentType('flyer')}
          />
          Flyer
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="radio"
            name="contentType"
            value="email"
            checked={contentType === 'email'}
            onChange={() => setContentType('email')}
          />
          Email
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="radio"
            name="contentType"
            value="page"
            checked={contentType === 'page'}
            onChange={() => setContentType('page')}
          />
          Web Page
        </label>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Disclaimer</label>
        <textarea
          className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
          rows={3}
          value={disclaimer}
          onChange={(event) => setDisclaimer(event.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={showsComp}
          onChange={(event) => setShowsComp(event.target.checked)}
        />
        Show compensation details
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Run Preflight
      </button>

      {status && <p className="text-xs text-slate-500">{status}</p>}
    </form>
  );
}
