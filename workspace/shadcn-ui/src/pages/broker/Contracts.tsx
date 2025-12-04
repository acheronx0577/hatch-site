import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  listContractInstances,
  recommendContractTemplates,
  searchContractTemplates,
  createContractInstance,
  getContractInstance,
  sendContractForSignature,
  deleteContractInstance,
  deleteContractInstances,
  type ContractInstance,
  type ContractTemplate
} from '@/lib/api/hatch';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

export default function ContractsPage() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const [search, setSearch] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [templatePage, setTemplatePage] = useState(1);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const PAGE_SIZE = 16;

  const templatesQuery = useQuery({
    queryKey: ['contracts', 'templates', orgId, search],
    queryFn: () => searchContractTemplates(orgId, { query: search.trim(), includeUrl: true }),
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
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId, propertyId] });
      setSelectedInstanceId(created.id);
    }
  });

  const instanceDetail = useQuery({
    queryKey: ['contracts', 'instance', selectedInstanceId],
    queryFn: () => getContractInstance(orgId, selectedInstanceId ?? ''),
    enabled: Boolean(selectedInstanceId)
  });

  const templatesAll = templatesQuery.data ?? [];
  const templates = templatesAll.filter((t) => {
    const key = (t.s3Key || '').toLowerCase();
    const url = (t.templateUrl || '').toLowerCase();
    return key.endsWith('.pdf') || url.includes('.pdf');
  });
  const templateUrlMap = useMemo(() => {
    const map: Record<string, string> = {};
    const addIfPdf = (t: any) => {
      const key = (t?.s3Key || '').toLowerCase();
      const url = (t?.templateUrl || '').toLowerCase();
      if (key.endsWith('.pdf') || url.includes('.pdf')) {
        if (t?.templateUrl) map[t.id] = t.templateUrl;
      }
    };
    templatesAll.forEach(addIfPdf);
    (recommendationsQuery.data ?? []).forEach(addIfPdf);
    return map;
  }, [templatesAll, recommendationsQuery.data]);
  const totalPages = Math.max(1, Math.ceil((templates.length || 1) / PAGE_SIZE));
  const pagedTemplates = templates.slice((templatePage - 1) * PAGE_SIZE, templatePage * PAGE_SIZE);

  useEffect(() => {
    setTemplatePage(1);
  }, [search, orgId, templates.length]);
  const recommendations = recommendationsQuery.data ?? [];
  const instances = instancesQuery.data ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(instances.map((i) => i.id)) : new Set());
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteOneMutation = useMutation({
    mutationFn: async (id: string) => deleteContractInstance(orgId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId, propertyId] });
      setSelectedIds(new Set());
    }
  });

  const deleteManyMutation = useMutation({
    mutationFn: async (ids: string[]) => deleteContractInstances(orgId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId, propertyId] });
      setSelectedIds(new Set());
    }
  });

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
            {pagedTemplates.map((template) => (
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
          {templates.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                Showing {(templatePage - 1) * PAGE_SIZE + 1}-
                {Math.min(templatePage * PAGE_SIZE, templates.length)} of {templates.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplatePage((p) => Math.max(1, p - 1))}
                  disabled={templatePage === 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-slate-500">
                  Page {templatePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplatePage((p) => Math.min(totalPages, p + 1))}
                  disabled={templatePage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{instances.length} items</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0 || deleteManyMutation.isLoading}
              onClick={() => deleteManyMutation.mutate(Array.from(selectedIds))}
            >
              {deleteManyMutation.isLoading ? 'Deleting…' : `Delete (${selectedIds.size})`}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === instances.length && instances.length > 0}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
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
                  <td colSpan={6} className="px-3 py-5 text-center text-slate-400">
                    Loading instances…
                  </td>
                </tr>
              ) : instances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-slate-400">
                    No contract drafts yet.
                  </td>
                </tr>
              ) : (
                instances.map((instance) => (
                  <tr key={instance.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(instance.id)}
                        onChange={() => toggleOne(instance.id)}
                      />
                    </td>
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
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedInstanceId(instance.id)}>
                          Open
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteOneMutation.mutate(instance.id)}
                          disabled={deleteOneMutation.isLoading}
                        >
                          Delete
                        </Button>
                      </div>
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
          orgId={orgId}
          templateUrlMap={templateUrlMap}
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

function InstanceDetail({
  instance,
  orgId,
  templateUrlMap,
  onClose
}: {
  instance: ContractInstance;
  orgId: string;
  templateUrlMap: Record<string, string>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerRole, setSignerRole] = useState('buyer');

  const sendMutation = useMutation({
    mutationFn: async () =>
      sendContractForSignature(orgId, instance.id, {
        signers:
          signerName && signerEmail
            ? [
                {
                  name: signerName,
                  email: signerEmail,
                  role: signerRole
                }
              ]
            : [],
        returnUrl: window.location.origin
      }),
    onSuccess: (data) => {
      // Open embedded sender view in the same tab so the user returns to Hatch.
      if (data?.senderViewUrl) {
        window.location.href = data.senderViewUrl;
      }
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId] });
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instance', instance.id] });
    }
  });

  const fallbackTemplateUrl = templateUrlMap[instance.templateId];
  const draftIsPdf = Boolean(instance.draftUrl && instance.draftUrl.toLowerCase().includes('.pdf'));
  const viewSrc = instance.signedUrl ?? (draftIsPdf ? instance.draftUrl : undefined) ?? fallbackTemplateUrl;
  const hasPdf = Boolean(viewSrc);
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
              <iframe title="Contract PDF" src={viewSrc} className="h-full w-full" />
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

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Signature</p>
                <h4 className="text-base font-semibold text-slate-900">Send for signature</h4>
                <p className="text-xs text-slate-500">Enter a signer to start routing.</p>
              </div>
              <StatusBadge status={instance.status} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Signer name"
              />
              <Input
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="Signer email"
                type="email"
              />
              <Input
                value={signerRole}
                onChange={(e) => setSignerRole(e.target.value)}
                placeholder="Role (buyer/seller)"
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => sendMutation.mutate()}
                disabled={
                  instance.status !== 'DRAFT' || !signerName || !signerEmail || sendMutation.isLoading
                }
              >
                {sendMutation.isLoading ? 'Sending…' : 'Send for signature'}
              </Button>
              {instance.status !== 'DRAFT' ? (
                <p className="text-xs text-slate-500">Only draft contracts can be sent.</p>
              ) : null}
              {sendMutation.error ? (
                <p className="text-xs text-rose-600">Failed to send. Try again.</p>
              ) : null}
              {sendMutation.isSuccess ? (
                <p className="text-xs text-emerald-600">Sent. Watch for DocuSign email.</p>
              ) : null}
            </div>
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
