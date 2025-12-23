'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Card } from '@/components/ui/card';
import { fetchLeads, LeadRecord, updateLeadStatus } from '@/lib/api/leads';
import { fetchMissionControlAgents } from '@/lib/api/mission-control';
import type { MissionControlOverview as MissionControlOverviewData } from '@/lib/api/mission-control';

const statusOptions = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'UNQUALIFIED',
  'APPOINTMENT_SET',
  'UNDER_CONTRACT',
  'CLOSED'
];

interface DashboardLeadsViewProps {
  orgId: string;
}

const leadsQueryKey = (orgId: string) => ['leads', orgId];
const missionControlOverviewKey = (orgId: string) => ['mission-control', 'overview', orgId];
const missionControlAgentsKey = (orgId: string) => ['mission-control', 'agents', orgId];

const leadStatusToStatKey: Partial<Record<string, keyof MissionControlOverviewData['leadStats']>> = {
  NEW: 'newLeads',
  CONTACTED: 'contactedLeads',
  QUALIFIED: 'qualifiedLeads',
  UNQUALIFIED: 'unqualifiedLeads',
  APPOINTMENT_SET: 'appointmentsSet'
};

export function DashboardLeadsView({ orgId }: DashboardLeadsViewProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const focusAgentProfileId = searchParams?.get('agentProfileId') ?? null;
  const statusFilter = (searchParams?.get('status') ?? '').trim().toUpperCase() || null;

  const { data: leads, isLoading } = useQuery({
    queryKey: [...leadsQueryKey(orgId), statusFilter],
    queryFn: () => fetchLeads(orgId, statusFilter ?? undefined)
  });
  const { data: agents } = useQuery({
    queryKey: ['mission-control', 'agents', orgId, 'lead-assignment'],
    queryFn: () => fetchMissionControlAgents(orgId)
  });

  const agentOptions = useMemo(
    () =>
      (agents ?? []).map((agent) => ({
        id: agent.agentProfileId,
        label: `${agent.name}`
      })),
    [agents]
  );

  const mutation = useMutation({
    mutationFn: (params: { leadId: string; status?: string; agentProfileId?: string | null }) =>
      updateLeadStatus(orgId, params.leadId, {
        status: params.status ?? 'NEW',
        agentProfileId: params.agentProfileId
      }),
    onMutate: async (params) => {
      const nextStatus = params.status ?? 'NEW';

      await Promise.all([
        queryClient.cancelQueries({ queryKey: leadsQueryKey(orgId) }),
        queryClient.cancelQueries({ queryKey: missionControlOverviewKey(orgId) }),
        queryClient.cancelQueries({ queryKey: missionControlAgentsKey(orgId) })
      ]);

      const previousLeads = queryClient.getQueryData<LeadRecord[]>(leadsQueryKey(orgId));
      const previousOverview = queryClient.getQueryData<MissionControlOverviewData>(missionControlOverviewKey(orgId));

      const previousLead = previousLeads?.find((lead) => lead.id === params.leadId);
      const previousStatus = previousLead?.status;

      queryClient.setQueryData<LeadRecord[]>(leadsQueryKey(orgId), (current) => {
        if (!current) return current;
        return current.map((lead) =>
          lead.id === params.leadId
            ? {
                ...lead,
                status: nextStatus,
                agentProfileId: params.agentProfileId ?? lead.agentProfileId
              }
            : lead
        );
      });

      if (previousStatus && previousStatus !== nextStatus) {
        queryClient.setQueryData<MissionControlOverviewData>(missionControlOverviewKey(orgId), (current) => {
          if (!current) return current;
          const fromKey = leadStatusToStatKey[previousStatus];
          const toKey = leadStatusToStatKey[nextStatus];

          if (!fromKey && !toKey) return current;

          const nextLeadStats = { ...current.leadStats };
          if (fromKey) {
            nextLeadStats[fromKey] = Math.max(0, (nextLeadStats[fromKey] ?? 0) - 1);
          }
          if (toKey) {
            nextLeadStats[toKey] = (nextLeadStats[toKey] ?? 0) + 1;
          }

          return { ...current, leadStats: nextLeadStats };
        });
      }

      return { previousLeads, previousOverview };
    },
    onError: (_error, _params, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(leadsQueryKey(orgId), context.previousLeads);
      }
      if (context?.previousOverview) {
        queryClient.setQueryData(missionControlOverviewKey(orgId), context.previousOverview);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsQueryKey(orgId) });
      queryClient.invalidateQueries({ queryKey: missionControlOverviewKey(orgId) });
      queryClient.invalidateQueries({ queryKey: missionControlAgentsKey(orgId) });
    }
  });

  const leadsToRender = useMemo(() => {
    const list = leads ?? [];
    if (!focusAgentProfileId) return list;
    return list.filter((lead) => lead.agentProfileId === focusAgentProfileId);
  }, [focusAgentProfileId, leads]);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-wide text-slate-500">Leads</p>
        <h1 className="text-2xl font-semibold text-slate-900">Consumer inquiries</h1>
        <p className="text-sm text-slate-500">Assign leads and keep statuses in sync with the portal.</p>
        {focusAgentProfileId || statusFilter ? (
          <p className="mt-1 text-xs text-slate-500">
            Filtered to{' '}
            {focusAgentProfileId ? (
              <>
                agent <span className="font-mono">{focusAgentProfileId}</span>
              </>
            ) : null}
            {focusAgentProfileId && statusFilter ? ' · ' : null}
            {statusFilter ? <>status <span className="font-mono">{statusFilter}</span></> : null}.{' '}
            <Link href="/dashboard/leads" className="font-semibold text-brand-700 hover:underline">
              Clear filter
            </Link>
          </p>
        ) : null}
      </div>
      <Card className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Lead</th>
              <th className="px-4 py-3 text-left">Listing</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Assigned agent</th>
              <th className="px-4 py-3 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading leads…
                </td>
              </tr>
            ) : leadsToRender.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No leads yet. Portal inquiries will appear here.
                </td>
              </tr>
            ) : (
              leadsToRender.map((lead) => (
                <tr key={lead.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{lead.name ?? lead.email ?? 'Unspecified'}</div>
                    <div className="text-xs text-slate-500">{lead.email ?? 'No email'}</div>
                    {lead.personId ? (
                      <Link href={`/people/${lead.personId}`} className="text-xs text-brand-600">
                        View in CRM
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{lead.listing?.addressLine1 ?? 'General inquiry'}</div>
                    <div className="text-xs text-slate-500">{lead.listing?.city}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label="Lead status"
                      className="w-48 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={lead.status}
                      onChange={(event) =>
                        mutation.mutate({
                          leadId: lead.id,
                          status: event.target.value,
                          agentProfileId: lead.agentProfileId ?? undefined
                        })
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label="Assigned agent"
                      className="w-48 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={lead.agentProfileId ?? ''}
                      onChange={(event) =>
                        mutation.mutate({
                          leadId: lead.id,
                          status: lead.status,
                          agentProfileId: event.target.value === '' ? null : event.target.value
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {agentOptions.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      {lead.source}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
