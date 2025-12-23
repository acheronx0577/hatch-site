import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  addDripStep,
  createDripCampaign,
  listDripCampaigns,
  type DripCampaign,
  type DripStep
} from '@/lib/api/drip-campaigns';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

export default function DripCampaignsPage() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [stepCampaignId, setStepCampaignId] = useState<string | null>(null);
  const [stepOffset, setStepOffset] = useState(24);
  const [stepAction, setStepAction] = useState('SEND_EMAIL');
  const [stepPayload, setStepPayload] = useState('{"subject":"Follow up","body":"Checking in"}');
  const [addingStep, setAddingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listDripCampaigns(orgId);
        if (!cancelled) setCampaigns(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load campaigns');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const created = await createDripCampaign(orgId, { name: newName.trim(), description: newDesc.trim() || undefined });
      setCampaigns((prev) => [created, ...prev]);
      setNewName('');
      setNewDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  const handleAddStep = async () => {
    if (!stepCampaignId || addingStep) return;
    setAddingStep(true);
    setStepError(null);
    try {
      let payload: Record<string, unknown> | undefined;
      if (stepPayload.trim()) {
        try {
          payload = JSON.parse(stepPayload);
        } catch (err) {
          setStepError('Payload must be valid JSON');
          setAddingStep(false);
          return;
        }
      }
      const step = await addDripStep(orgId, stepCampaignId, {
        offsetHours: Number(stepOffset) || 0,
        actionType: stepAction,
        payload
      });
      setCampaigns((prev) =>
        prev.map((c) => (c.id === stepCampaignId ? { ...c, steps: [...c.steps, step] } : c))
      );
      setStepOffset(24);
      setStepAction('SEND_EMAIL');
      setStepPayload('{"subject":"Follow up","body":"Checking in"}');
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Failed to add step');
    } finally {
      setAddingStep(false);
    }
  };

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === stepCampaignId) ?? null,
    [campaigns, stepCampaignId]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Marketing</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Drip Campaigns</h1>
          <p className="text-sm text-slate-600">
            Build lightweight drips that run through Playbooks—no new AI surfaces required.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/broker/marketing">Back to Marketing</Link>
        </Button>
      </div>

      <Card className="space-y-3 p-6 hover:translate-y-0 hover:shadow-brand">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Create drip campaign</p>
            <p className="text-xs text-muted-foreground">Name + optional description; steps can be added after save.</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              placeholder="Campaign name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full md:w-64"
            />
            <Input
              placeholder="Short description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full md:w-80"
            />
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <Card className="p-6 hover:translate-y-0 hover:shadow-brand">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Campaigns</h2>
          <div className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No campaigns yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3 pt-3">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-xl border border-[var(--glass-border)] bg-white/25 p-4 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {campaign.description || 'No description'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {campaign.enabled ? (
                      <Badge variant="success">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setStepCampaignId(campaign.id)}>
                      Add step
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {campaign.steps.length === 0 ? (
                    <span>No steps yet.</span>
                  ) : (
                    campaign.steps
                      .sort((a, b) => a.offsetHours - b.offsetHours)
                      .map((step) => (
                        <span
                          key={step.id}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-white/25 px-2 py-1 text-xs backdrop-blur"
                        >
                          <span className="font-semibold">{step.actionType}</span>
                          <span className="text-muted-foreground">@ {step.offsetHours}h</span>
                        </span>
                      ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {stepCampaignId && (
        <Card className="p-6 [--hatch-card-alpha:var(--hatch-glass-alpha-elevated)] hover:translate-y-0 hover:shadow-brand">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-indigo-900">Add step</p>
              <p className="text-xs text-indigo-800">
                {selectedCampaign ? selectedCampaign.name : 'Select a campaign'} — offsets are in hours from enrollment.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStepCampaignId(null)}>
              Close
            </Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Input
              type="number"
              min={0}
              value={stepOffset}
              onChange={(e) => setStepOffset(parseInt(e.target.value, 10))}
              placeholder="Offset (hours)"
            />
            <Input
              value={stepAction}
              onChange={(e) => setStepAction(e.target.value)}
              placeholder="Action type (e.g., SEND_EMAIL)"
            />
            <Textarea
              value={stepPayload}
              onChange={(e) => setStepPayload(e.target.value)}
              className="md:col-span-2"
              rows={3}
              placeholder='Payload JSON (e.g., {"subject":"Hello","body":"Checking in"})'
            />
          </div>
          {stepError && <p className="mt-2 text-sm text-rose-600">{stepError}</p>}
          <div className="mt-3">
            <Button onClick={handleAddStep} disabled={addingStep}>
              {addingStep ? 'Adding…' : 'Add step'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
