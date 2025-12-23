'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ContextualHelpTrigger } from '@/components/help/ContextualHelp';
import { fetchMlsConfig, MlsConfig, MlsProviderOption, updateMlsConfig } from '@/lib/api/mls';

const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'org-hatch';
const PROVIDERS: MlsProviderOption[] = ['STELLAR', 'NABOR', 'MATRIX', 'GENERIC'];

export default function MlsSettingsPage() {
  const orgId = DEFAULT_ORG_ID;
  const [config, setConfig] = useState<MlsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchMlsConfig(orgId)
      .then((data) => {
        if (!mounted) return;
        setConfig(
          data ?? {
            organizationId: orgId,
            provider: 'GENERIC',
            officeCode: '',
            brokerId: '',
            boardName: '',
            boardUrl: '',
            enabled: true
          }
        );
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setError('Unable to load MLS settings.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [orgId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMlsConfig(orgId, {
        provider: config.provider,
        officeCode: config.officeCode ?? undefined,
        brokerId: config.brokerId ?? undefined,
        boardName: config.boardName ?? undefined,
        boardUrl: config.boardUrl ?? undefined,
        enabled: config.enabled
      });
      setConfig(updated);
    } catch (err) {
      console.error(err);
      setError('Unable to save MLS settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !config) {
    return <p className="p-4 text-sm text-slate-500">Loading MLS settings…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-slate-900">MLS configuration</CardTitle>
          <p className="text-sm text-slate-500">Store brokerage identifiers so Hatch can sync with your MLS board.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-slate-600">Provider</label>
                <ContextualHelpTrigger fieldPath="broker.profile.mlsProvider" className="h-7 w-7 text-slate-500 hover:text-slate-900" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROVIDERS.map((provider) => (
                  <button
                    type="button"
                    key={provider}
                    className={`rounded-full border px-4 py-1 text-xs font-semibold ${
                      config.provider === provider ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'
                    }`}
                    onClick={() => setConfig((prev) => (prev ? { ...prev, provider } : prev))}
                  >
                    {provider}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-slate-600">Office code</label>
                  <ContextualHelpTrigger fieldPath="broker.profile.mlsOfficeCode" className="h-7 w-7 text-slate-500 hover:text-slate-900" />
                </div>
                <Input
                  value={config.officeCode ?? ''}
                  onChange={(event) => setConfig((prev) => (prev ? { ...prev, officeCode: event.target.value } : prev))}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-slate-600">Broker ID</label>
                  <ContextualHelpTrigger fieldPath="broker.profile.mlsId" className="h-7 w-7 text-slate-500 hover:text-slate-900" />
                </div>
                <Input
                  value={config.brokerId ?? ''}
                  onChange={(event) => setConfig((prev) => (prev ? { ...prev, brokerId: event.target.value } : prev))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-slate-600">Board name</label>
                  <ContextualHelpTrigger fieldPath="broker.profile.mlsBoardName" className="h-7 w-7 text-slate-500 hover:text-slate-900" />
                </div>
                <Input
                  value={config.boardName ?? ''}
                  onChange={(event) => setConfig((prev) => (prev ? { ...prev, boardName: event.target.value } : prev))}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-slate-600">Board URL</label>
                  <ContextualHelpTrigger fieldPath="broker.profile.mlsBoardUrl" className="h-7 w-7 text-slate-500 hover:text-slate-900" />
                </div>
                <Input
                  value={config.boardUrl ?? ''}
                  onChange={(event) => setConfig((prev) => (prev ? { ...prev, boardUrl: event.target.value } : prev))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span>Status:</span>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  config.enabled ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-600'
                }`}
                onClick={() => setConfig((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev))}
              >
                {config.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <Button type="submit" disabled={saving} className="w-full md:w-auto">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
