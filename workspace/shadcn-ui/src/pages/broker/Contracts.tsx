import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  listContractInstances,
  listContractTemplates,
  recommendContractTemplates,
  searchContractTemplates,
  createContractInstance,
  getContractInstance,
  type ContractInstance,
  type ContractTemplate
} from '@/lib/api/hatch';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

export default function ContractsPage() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const [search, setSearch] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ['contracts', 'templates', orgId, search],
    queryFn: () =>
      search.trim().length
        ? searchContractTemplates(orgId, { query: search.trim(), includeUrl: true })
        : listContractTemplates(orgId),
    enabled: Boolean(orgId)
  });

  const recommendationsQuery = useQuery({
    queryKey: ['contracts', 'recommendations', orgId],
    queryFn: () => recommendContractTemplates(orgId, {}),
    enabled: Boolean(orgId)
  });

  const instancesQuery = useQuery({
    queryKey: ['contracts', 'instances', orgId, propertyId],
    queryFn: () => listContractInstances(orgId, propertyId ? { propertyId } : {}),
    enabled: Boolean(orgId)
  });

  const createDraft = useMutation({
    mutationFn: (templateId: string) =>
      createContractInstance(orgId, { templateId, propertyId: propertyId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId, propertyId] });
    }
  });

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const instanceDetail = useQuery({
    queryKey: ['contracts', 'instance', selectedInstanceId],
    queryFn: () => getContractInstance(orgId, selectedInstanceId ?? ''),
    enabled: Boolean(selectedInstanceId)
  });

  const templates = templatesQuery.data ?? [];
  const recommendations = recommendationsQuery.data ?? [];
  const instances = instancesQuery.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Contracts</p>
          <h1 className="text-2xl font-semibold text-slate-900">Contract Center</h1>
          <p className="text-sm text-slate-500">Pick templates from your library and create drafts instantly.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="Property / Listing ID (optional)"
            className="w-64"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates"
            className="w-64"
          />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="col-span-2 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Templates</h2>
              <p className="text-sm text-slate-500">
                Browse your library. Click “Create draft” to start from a template.
              </p>
            </div>
            <span className="text-xs text-slate-500">{templates.length} items</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onCreate={() => createDraft.mutate(template.id)}
              />
            ))}
            {templates.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                {templatesQuery.isLoading ? 'Loading templates…' : 'No templates found.'}
              </div>
            )}
          </div>
        </Card>

        <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recommended</h2>
            <span className="text-xs text-slate-500">{recommendations.length} picks</span>
          </div>
          <div className="space-y-2">
            {recommendations.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => createDraft.mutate(template.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{template.name}</p>
                  <p className="text-xs text-slate-500">{template.recommendationReason ?? 'Suggested'}</p>
                </div>
                <Badge variant="secondary">{template.side ?? 'ANY'}</Badge>
              </button>
            ))}
            {recommendations.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
                No recommendations yet.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Instances</h2>
          <span className="text-xs text-slate-500">{instances.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Template</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instancesQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-slate-400">
                    Loading instances…
                  </td>
                </tr>
              ) : instances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-slate-400">
                    No contract drafts yet.
                  </td>
                </tr>
              ) : (
                instances.map((instance) => (
                  <tr key={instance.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{instance.title}</p>
                      {instance.recommendationReason ? (
                        <p className="text-xs text-slate-500">{instance.recommendationReason}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{instance.template?.name ?? 'Ad-hoc'}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={instance.status} />
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {new Date(instance.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelectedInstanceId(instance.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedInstanceId && instanceDetail.data ? (
        <InstanceDetail
          instance={instanceDetail.data}
          onClose={() => setSelectedInstanceId(null)}
        />
      ) : null}
    </div>
  );
}

function TemplateCard({ template, onCreate }: { template: ContractTemplate & { templateUrl?: string | null }; onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{template.code}</p>
        <h3 className="text-base font-semibold text-slate-900">{template.name}</h3>
        <p className="text-sm text-slate-500 line-clamp-2">{template.description ?? 'Contract template'}</p>
        {template.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px]">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">{template.side ?? 'Any side'}</span>
        <div className="flex gap-2">
          {template.templateUrl ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={template.templateUrl} target="_blank" rel="noreferrer">
                View
              </a>
            </Button>
          ) : null}
          <Button size="sm" onClick={onCreate}>
            Create draft
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'SIGNED'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'OUT_FOR_SIGNATURE'
        ? 'bg-blue-100 text-blue-700'
        : status === 'VOIDED'
          ? 'bg-rose-100 text-rose-700'
          : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}

function InstanceDetail({ instance, onClose }: { instance: ContractInstance; onClose: () => void }) {
  const hasPdf = instance.draftUrl || instance.signedUrl;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{instance.template?.code ?? 'CONTRACT'}</p>
              <h3 className="text-xl font-semibold text-slate-900">{instance.title}</h3>
              <p className="text-sm text-slate-500">{instance.template?.name ?? 'Ad-hoc contract'}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={instance.status} />
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>

          {hasPdf ? (
            <div className="h-[480px] overflow-hidden rounded-xl border border-slate-200">
              <iframe
                title="Contract PDF"
                src={instance.signedUrl ?? instance.draftUrl ?? undefined}
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              No preview available.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Template" value={instance.template?.name ?? 'Ad-hoc'} />
            <InfoRow label="Last updated" value={new Date(instance.updatedAt).toLocaleString()} />
            <InfoRow label="Listing" value={instance.orgListingId ?? 'Not linked'} />
            <InfoRow label="Transaction" value={instance.orgTransactionId ?? 'Not linked'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
