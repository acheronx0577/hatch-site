"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getContractInstance, updateContractInstance, type ContractInstanceRecord } from '@/lib/api/contracts';

type ContractInstanceDetailViewProps = {
  orgId: string;
  contractInstanceId: string;
};

export function ContractInstanceDetailView({ orgId, contractInstanceId }: ContractInstanceDetailViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'contracts', orgId, contractInstanceId],
    queryFn: () => getContractInstance(orgId, contractInstanceId),
    staleTime: 15_000
  });

  const instance = data ?? null;

  const [title, setTitle] = useState('');
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});

  const editableKeys = useMemo(() => instance?.editableKeys ?? [], [instance?.editableKeys]);
  const initRef = useRef<{ instanceId: string | null; editableKeysSignature: string }>({
    instanceId: null,
    editableKeysSignature: ''
  });

  useEffect(() => {
    if (!instance) return;

    const editableKeysSignature = editableKeys.join('|');
    if (initRef.current.instanceId === instance.id && initRef.current.editableKeysSignature === editableKeysSignature) {
      return;
    }

    initRef.current = { instanceId: instance.id, editableKeysSignature };
    setTitle(instance.title);

    const next: Record<string, string> = {};
    for (const key of editableKeys) {
      const raw = instance.fieldValues?.[key];
      next[key] = raw === null || raw === undefined ? '' : String(raw);
    }
    setDraftFields(next);
  }, [instance, editableKeys]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(draftFields)) {
        const trimmed = value.trim();
        payload[key] = trimmed.length === 0 ? null : trimmed;
      }

      return updateContractInstance(orgId, contractInstanceId, {
        title: title.trim().length ? title.trim() : undefined,
        fieldValues: payload
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'contracts', orgId, contractInstanceId] });
      toast({ title: 'Contract updated', description: 'Field values saved to this draft.' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to update the contract right now.'
      });
    }
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading contract…</p>
      </Card>
    );
  }

  if (!instance) {
    return (
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Contract not found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Contract</p>
            <h1 className="text-2xl font-semibold text-slate-900">{instance.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className={getStatusBadge(instance.status)}>{formatStatus(instance.status)}</Badge>
              {instance.template?.code ? <Badge variant="outline">{instance.template.code}</Badge> : null}
              {instance.orgListingId ? (
                <Badge variant="outline">
                  <Link href={`/dashboard/properties/${instance.orgListingId}`} className="hover:underline">
                    Property
                  </Link>
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {instance.draftUrl ? (
              <Button asChild variant="secondary">
                <a href={instance.draftUrl} target="_blank" rel="noreferrer">
                  Open draft PDF
                </a>
              </Button>
            ) : null}
            {instance.signedUrl ? (
              <Button asChild variant="secondary">
                <a href={instance.signedUrl} target="_blank" rel="noreferrer">
                  Open signed PDF
                </a>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => router.push('/dashboard/contracts')}>
              Back
            </Button>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 text-sm text-slate-600 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer</dt>
            <dd className="mt-1 font-medium text-slate-900">{renderParty(instance.buyerPerson)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller</dt>
            <dd className="mt-1 font-medium text-slate-900">{renderParty(instance.sellerPerson)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</dt>
            <dd className="mt-1 font-medium text-slate-900">{new Date(instance.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Editable fields</h2>
        <p className="text-sm text-slate-500">Update the values that will be used for signing and downstream automation.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {editableKeys.length === 0 ? (
            <p className="text-sm text-slate-500">No editable keys were provided for this template.</p>
          ) : (
            editableKeys.map((key) => (
              <div key={key} className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</label>
                <Input
                  type={inputTypeForKey(key)}
                  value={draftFields[key] ?? ''}
                  onChange={(event) =>
                    setDraftFields((prev) => ({
                      ...prev,
                      [key]: event.target.value
                    }))
                  }
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard', 'contracts', orgId, contractInstanceId] })}>
            Reset
          </Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function renderParty(party: ContractInstanceRecord['buyerPerson']): string {
  if (!party) return '—';
  return party.fullName?.trim() || `${party.firstName ?? ''} ${party.lastName ?? ''}`.trim() || party.id;
}

function inputTypeForKey(key: string): React.HTMLInputTypeAttribute {
  const normalized = key.toUpperCase();
  if (normalized.includes('EMAIL')) return 'email';
  if (normalized.includes('PHONE')) return 'tel';
  if (normalized.includes('DATE')) return 'date';
  if (normalized.includes('PRICE') || normalized.includes('AMOUNT')) return 'number';
  return 'text';
}

const getStatusBadge = (status: string) => {
  if (status === 'SIGNED') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status === 'OUT_FOR_SIGNATURE') return 'border border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'VOIDED') return 'border border-rose-100 bg-rose-50 text-rose-700';
  return 'border bg-slate-100 text-slate-700';
};

const formatStatus = (status: string) => {
  if (status === 'OUT_FOR_SIGNATURE') return 'Sent';
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
};
