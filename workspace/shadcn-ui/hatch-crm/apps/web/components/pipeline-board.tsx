"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  Award,
  ChevronDown,
  Clock3,
  ExternalLink,
  HelpCircle,
  LayoutPanelTop,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  ShieldCheck,
  Search,
  Sparkles,
  Target,
  UserRound,
  XCircle
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { CSS } from '@dnd-kit/utilities';
import { differenceInDays, differenceInMinutes, formatDistanceToNow } from 'date-fns';
import { FIELD_MAP } from '@hatch/shared/layout';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { LeadDrawer } from '@/components/leads/lead-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useApiError } from '@/hooks/use-api-error';
import { createLead, getLeads, LeadSummary, ListLeadsParams, Pipeline, PipelineStage, updateLead } from '@/lib/api';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';

interface PipelineBoardProps {
  pipelines: Pipeline[];
  initialLeads: LeadSummary[];
  initialNextCursor: string | null;
  pageSize: number;
}

export default function PipelineBoard({
  pipelines,
  initialLeads,
  initialNextCursor,
  pageSize
}: PipelineBoardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [leads, setLeads] = useState<LeadSummary[]>(initialLeads);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(pipelines[0]?.id ?? '');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [leadTypeFilter, setLeadTypeFilter] = useState<'all' | 'BUYER' | 'SELLER' | 'UNKNOWN'>('all');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [preapprovedOnly, setPreapprovedOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [guidedMode, setGuidedMode] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();
  const snapshotRef = useRef<LeadSummary[] | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const hasHydratedFiltersRef = useRef<boolean>(false);
  const { banner, showError, clearError } = useApiError();
  const [cardLayoutFields, setCardLayoutFields] = useState<Array<{ field: string; label?: string; order?: number; width?: number }> | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPipelineId, setCreatePipelineId] = useState<string>('');
  const [createStageId, setCreateStageId] = useState<string>('');
  const [createFirstName, setCreateFirstName] = useState('');
  const [createLastName, setCreateLastName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createLeadType, setCreateLeadType] = useState<'BUYER' | 'SELLER' | 'UNKNOWN'>('UNKNOWN');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const stageLookup = useMemo(() => {
    const map = new Map<
      string,
      { stage: PipelineStage; pipeline: Pipeline; index: number; totalStages: number }
    >();
    pipelines.forEach((pipeline) => {
      pipeline.stages.forEach((stage, index) => {
        map.set(stage.id, { stage, pipeline, index, totalStages: pipeline.stages.length });
      });
    });
    return map;
  }, [pipelines]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );

  const baseline = useMemo(() => FIELD_MAP.leads ?? [], []);
  const trimmedSearch = searchQuery.trim();
  const hasSearch = trimmedSearch.length > 0;
  const [debouncedQuery, setDebouncedQuery] = useState<string>(trimmedSearch);
  const debouncedNormalized = debouncedQuery.toLowerCase();
  const debouncedNumeric = debouncedQuery.replace(/\D/g, '');
  const debouncedHasSearch = debouncedQuery.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(trimmedSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    resolveLayout({ object: 'leads', kind: 'list', signal: controller.signal })
      .then((manifest) => {
        setCardLayoutFields(manifest.fields ?? []);
        setLayoutError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLayoutError(err instanceof Error ? err.message : 'Unable to load layout preferences for lead cards. Using defaults.');
        setCardLayoutFields(null);
      });
    return () => controller.abort();
  }, []);

  const cardFields = useMemo(() => {
    const allowedFields = baseline.map((field) => field.field);
    const manifest = cardLayoutFields ??
      baseline.map((field, index) => ({ field: field.field, label: field.label, order: index, width: field.width }));
    return applyLayout({ fields: manifest }, allowedFields, baseline).slice(0, 3);
  }, [cardLayoutFields, baseline]);

  const selectedPipeline = useMemo(() => {
    if (!pipelines.length) return undefined;
    return pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? pipelines[0];
  }, [pipelines, selectedPipelineId]);

  const buildLeadParams = useCallback(
    (overrides: Partial<ListLeadsParams> = {}) => {
      const params: ListLeadsParams = {
        limit: pageSize
      };
      if (selectedPipelineId) {
        params.pipelineId = selectedPipelineId;
      }
      if (ownerFilter !== 'all') {
        params.ownerId = ownerFilter;
      }
      if (tierFilter !== 'all') {
        params.scoreTier = [tierFilter];
      }
      if (leadTypeFilter !== 'all') {
        params.leadType = leadTypeFilter;
      }
      if (activityFilter !== 'all') {
        params.lastActivityDays = Number(activityFilter);
      }
      if (preapprovedOnly) {
        params.preapproved = true;
      }
      if (debouncedHasSearch) {
        params.q = debouncedQuery;
      }
      return { ...params, ...overrides };
    },
    [
      pageSize,
      selectedPipelineId,
      ownerFilter,
      tierFilter,
      leadTypeFilter,
      activityFilter,
      preapprovedOnly,
      debouncedHasSearch,
      debouncedQuery
    ]
  );

  const owners = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    leads.forEach((lead) => {
      if (lead.owner) {
        map.set(lead.owner.id, {
          id: lead.owner.id,
          name: lead.owner.name
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  useEffect(() => {
    if (!pipelines.length) {
      return;
    }

    const skipInitialFetch =
      !hasHydratedFiltersRef.current &&
      !debouncedHasSearch &&
      ownerFilter === 'all' &&
      tierFilter === 'all' &&
      leadTypeFilter === 'all' &&
      activityFilter === 'all' &&
      !preapprovedOnly;

    hasHydratedFiltersRef.current = true;
    if (skipInitialFetch) {
      return;
    }

    const controller = new AbortController();
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = controller;
    setIsRefreshing(true);
    setIsLoadingMore(false);
    const params = buildLeadParams();

    getLeads({ ...params, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setLeads(response.items);
        setNextCursor(response.nextCursor ?? null);
        clearError();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        showError(err);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setIsRefreshing(false);
      });

    return () => controller.abort();
  }, [
    pipelines.length,
    buildLeadParams,
    clearError,
    showError,
    debouncedHasSearch,
    ownerFilter,
    tierFilter,
    leadTypeFilter,
    activityFilter,
    preapprovedOnly
  ]);

  const activeLead = useMemo(
    () => (activeLeadId ? leads.find((lead) => lead.id === activeLeadId) ?? null : null),
    [leads, activeLeadId]
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore || isRefreshing) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const params = buildLeadParams({ cursor: nextCursor });
      const response = await getLeads(params);
      setLeads((prev) => mergeLeadPages(prev, response.items));
      setNextCursor(response.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, isRefreshing, buildLeadParams, showError, clearError]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const pipelineId = lead.pipelineId ?? lead.stage?.pipelineId ?? null;
      if (selectedPipeline && pipelineId !== selectedPipeline.id) {
        return false;
      }
      if (ownerFilter !== 'all' && lead.owner?.id !== ownerFilter) {
        return false;
      }
      if (tierFilter !== 'all' && lead.scoreTier !== tierFilter) {
        return false;
      }
      if (leadTypeFilter !== 'all' && (lead.leadType ?? 'UNKNOWN') !== leadTypeFilter) {
        return false;
      }
      if (preapprovedOnly && !lead.preapproved) {
        return false;
      }
      if (activityFilter !== 'all') {
        const windowDays = Number(activityFilter);
        if (!lead.lastActivityAt) {
          return false;
        }
        const diff = differenceInDays(new Date(), new Date(lead.lastActivityAt));
        if (diff > windowDays) {
          return false;
        }
      }
      if (debouncedNormalized) {
        const name = [lead.firstName, lead.lastName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const email = (lead.email ?? '').toLowerCase();
        const phoneDigits = (lead.phone ?? '').replace(/\D/g, '');
        const matchesName = name.length > 0 && name.includes(debouncedNormalized);
        const matchesEmail = email.length > 0 && email.includes(debouncedNormalized);
        const matchesPhone =
          debouncedNumeric.length >= 3 && phoneDigits.length > 0 && phoneDigits.includes(debouncedNumeric);
        if (!matchesName && !matchesEmail && !matchesPhone) {
          return false;
        }
      }
      return true;
    });
  }, [
    leads,
    ownerFilter,
    tierFilter,
    leadTypeFilter,
    activityFilter,
    preapprovedOnly,
    selectedPipeline,
    debouncedNormalized,
    debouncedNumeric
  ]);

  const columns = useMemo(() => {
    const map = new Map<string, LeadSummary[]>();
    if (selectedPipeline) {
      selectedPipeline.stages.forEach((stage) => {
        map.set(stage.id, []);
      });
    }
    filteredLeads.forEach((lead) => {
      const stageId = lead.stage?.id ?? lead.stageId;
      if (!stageId) return;
      const bucket = map.get(stageId);
      if (bucket) {
        bucket.push(lead);
      }
    });
    if (selectedPipeline) {
      selectedPipeline.stages.forEach((stage) => {
        const bucket = map.get(stage.id);
        if (bucket) {
          bucket.sort((a, b) => {
            const aDate = new Date(a.stageEnteredAt ?? a.createdAt).getTime();
            const bDate = new Date(b.stageEnteredAt ?? b.createdAt).getTime();
            return aDate - bDate;
          });
        }
      });
    }
    return map;
  }, [filteredLeads, selectedPipeline]);

  const matchingStageIds = useMemo(() => {
    if (!debouncedHasSearch) {
      return null;
    }
    const ids = new Set<string>();
    filteredLeads.forEach((lead) => {
      const stageId = lead.stage?.id ?? lead.stageId;
      if (stageId) {
        ids.add(stageId);
      }
    });
    return ids;
  }, [filteredLeads, debouncedHasSearch]);

  const visibleStages = useMemo(() => {
    if (!selectedPipeline) {
      return [];
    }
    if (!debouncedHasSearch || !matchingStageIds) {
      return selectedPipeline.stages;
    }
    return selectedPipeline.stages.filter((stage) => matchingStageIds.has(stage.id));
  }, [selectedPipeline, debouncedHasSearch, matchingStageIds]);

  const totalLeads = filteredLeads.length;
  const stageCount = selectedPipeline?.stages.length ?? 0;
  const visibleStageCount = visibleStages.length;
  const gridStageCount = debouncedHasSearch ? Math.max(visibleStageCount, 1) : stageCount;

  const heroMetrics = useMemo(() => {
    if (!selectedPipeline || filteredLeads.length === 0) {
      return {
        activeLeads: filteredLeads.length,
        avgStageMinutes: 0,
        conversionRate: 0
      };
    }

    const totalMinutesInStage = filteredLeads.reduce((minutes, lead) => {
      return (
        minutes +
        differenceInMinutes(new Date(), new Date(lead.stageEnteredAt ?? lead.createdAt))
      );
    }, 0);

    const highestStageOrder = selectedPipeline.stages.reduce((maxOrder, stage, index) => {
      const orderValue = stage.order ?? index + 1;
      return Math.max(maxOrder, orderValue);
    }, 0);

    const convertedLeads = filteredLeads.reduce((count, lead) => {
      const stageId = lead.stage?.id ?? lead.stageId;
      if (!stageId) {
        return count;
      }
      const meta = stageLookup.get(stageId);
      if (!meta) {
        return count;
      }
      const orderValue = meta.stage.order ?? meta.index + 1;
      return orderValue >= highestStageOrder ? count + 1 : count;
    }, 0);

    return {
      activeLeads: filteredLeads.length,
      avgStageMinutes:
        filteredLeads.length === 0 ? 0 : totalMinutesInStage / filteredLeads.length,
      conversionRate:
        filteredLeads.length === 0 ? 0 : (convertedLeads / filteredLeads.length) * 100
    };
  }, [filteredLeads, selectedPipeline, stageLookup]);

  const averageStageTimeCopy = formatMinutesToHuman(heroMetrics.avgStageMinutes);
  const conversionRateCopy = formatConversionRate(heroMetrics.conversionRate);

  const handleLeadCardClick = useCallback((lead: LeadSummary) => {
    setActiveLeadId(lead.id);
  }, []);

  const handleLeadUpdated = useCallback((updated: LeadSummary) => {
    setLeads((prev) =>
      prev.map((existing) => (existing.id === updated.id ? { ...existing, ...updated } : existing))
    );
  }, []);

  const closeDrawer = useCallback(() => setActiveLeadId(null), []);

  const filtersApplied = useMemo(
    () =>
      ownerFilter !== 'all' ||
      tierFilter !== 'all' ||
      leadTypeFilter !== 'all' ||
      activityFilter !== 'all' ||
      preapprovedOnly ||
      hasSearch,
    [ownerFilter, tierFilter, leadTypeFilter, activityFilter, preapprovedOnly, hasSearch]
  );

  const resetFilters = useCallback(() => {
    setOwnerFilter('all');
    setTierFilter('all');
    setLeadTypeFilter('all');
    setActivityFilter('all');
    setPreapprovedOnly(false);
    setSearchQuery('');
  }, []);

  const toggleCompactMode = useCallback(() => {
    setCompactMode((prev) => !prev);
  }, []);

  const toggleGuidedMode = useCallback(() => {
    setGuidedMode((prev) => !prev);
  }, []);

  const openCreateLead = useCallback(
    (targetStageId?: string) => {
      const meta = targetStageId ? stageLookup.get(targetStageId) : null;
      const pipeline = meta?.pipeline ?? selectedPipeline ?? pipelines[0];
      const stage = meta?.stage ?? pipeline?.stages?.[0] ?? null;
      if (!pipeline || !stage) {
        setCreateError('No pipeline stages are configured yet.');
        setCreateOpen(true);
        return;
      }

      setCreatePipelineId(pipeline.id);
      setCreateStageId(stage.id);
      setCreateFirstName('');
      setCreateLastName('');
      setCreateEmail('');
      setCreatePhone('');
      setCreateLeadType('UNKNOWN');
      setCreateError(null);
      setCreateOpen(true);
    },
    [pipelines, selectedPipeline, stageLookup]
  );

  const requestAddLead = useCallback(() => {
    openCreateLead();
  }, [openCreateLead]);

  const createPipeline = useMemo(() => {
    if (createPipelineId) {
      return pipelines.find((pipeline) => pipeline.id === createPipelineId) ?? null;
    }
    return selectedPipeline ?? pipelines[0] ?? null;
  }, [pipelines, selectedPipeline, createPipelineId]);

  const createStageOptions = useMemo(() => createPipeline?.stages ?? [], [createPipeline]);

  const canSubmitCreateLead = useMemo(() => {
    const hasIdentity =
      createFirstName.trim().length > 0 ||
      createLastName.trim().length > 0 ||
      createEmail.trim().length > 0 ||
      createPhone.trim().length > 0;
    return Boolean(hasIdentity && createPipelineId && createStageId && !isCreating);
  }, [createFirstName, createLastName, createEmail, createPhone, createPipelineId, createStageId, isCreating]);

  const submitCreateLead = useCallback(async () => {
    if (isCreating) return;

    const firstName = createFirstName.trim();
    const lastName = createLastName.trim();
    const email = createEmail.trim();
    const phone = createPhone.trim();

    if (!firstName && !lastName && !email && !phone) {
      setCreateError('Add at least a name, email, or phone number.');
      return;
    }
    if (!createPipelineId || !createStageId) {
      setCreateError('Select a pipeline stage.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await createLead({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        pipelineId: createPipelineId,
        stageId: createStageId,
        leadType: createLeadType
      });

      setLeads((prev) => [created, ...prev]);
      void queryClient.invalidateQueries({ queryKey: ['insights'] });
      setCreateOpen(false);
      setActiveLeadId(created.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create lead.';
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }, [
    isCreating,
    createFirstName,
    createLastName,
    createEmail,
    createPhone,
    createPipelineId,
    createStageId,
    createLeadType,
    queryClient
  ]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const fromStageId = active.data.current?.fromStageId as string | undefined;
    const toStageId = String(over.id);

    if (!toStageId || toStageId === fromStageId) {
      return;
    }

    const destinationMeta = stageLookup.get(toStageId);
    if (!destinationMeta) {
      return;
    }

    const { stage, pipeline } = destinationMeta;
    const nowIso = new Date().toISOString();

    snapshotRef.current = leads.map((lead) => ({ ...lead }));
    clearError();
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              pipelineId: pipeline.id,
              pipelineName: pipeline.name,
              pipelineType: pipeline.type,
              stageId: stage.id,
              stage: {
                id: stage.id,
                name: stage.name,
                order: stage.order,
                pipelineId: pipeline.id,
                pipelineName: pipeline.name,
                pipelineType: pipeline.type,
                slaMinutes: stage.slaMinutes
              },
              stageEnteredAt: nowIso
            }
          : lead
      )
    );

    startTransition(async () => {
      try {
        await updateLead(leadId, { stageId: stage.id, pipelineId: pipeline.id });
        snapshotRef.current = null;
        clearError();
        void queryClient.invalidateQueries({ queryKey: ['insights'] });
        router.refresh();
      } catch (err) {
        showError(err);
        const snapshot = snapshotRef.current;
        if (snapshot) {
          setLeads(snapshot);
        }
      }
    });
  };

  if (!selectedPipeline) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[var(--hatch-border)] bg-white/70 p-12 text-center shadow-hatch-card">
        <Sparkles className="h-10 w-10 text-brand-500" />
        <p className="text-xl font-semibold text-[var(--hatch-text)]">No pipelines yet</p>
        <p className="max-w-lg text-sm text-[var(--hatch-text-muted)]">
          Spin up your first pipeline from the admin console to start tracking buyers and sellers.
          Guided setup walks you through stages, SLAs, and automation.
        </p>
        <button
          type="button"
          onClick={requestAddLead}
          className="rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
        >
          Launch guided setup
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="sticky top-0 z-40">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              icon={LayoutPanelTop}
              label="Pipeline"
              value={selectedPipeline.id}
              onChange={(value) => setSelectedPipelineId(value)}
              options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
            />
            <FilterSelect
              icon={UserRound}
              label="Assigned agent"
              value={ownerFilter}
              onChange={setOwnerFilter}
              options={[
                { value: 'all', label: 'All agents' },
                ...owners.map((owner) => ({ value: owner.id, label: owner.name }))
              ]}
            />
            <FilterSelect
              icon={Target}
              label="Lead type"
              value={leadTypeFilter}
              onChange={(value) => setLeadTypeFilter(value as typeof leadTypeFilter)}
              options={[
                { value: 'all', label: 'Any type' },
                { value: 'BUYER', label: 'Buyer' },
                { value: 'SELLER', label: 'Seller' },
                { value: 'UNKNOWN', label: 'Unknown' }
              ]}
            />
            <FilterSelect
              icon={Award}
              label="Score Tier"
              value={tierFilter}
              onChange={setTierFilter}
              options={['all', 'A', 'B', 'C', 'D'].map((value) => ({
                value,
                label: value === 'all' ? 'All tiers' : value
              }))}
            />
            <FilterSelect
              icon={Clock3}
              label="Last Activity"
              value={activityFilter}
              onChange={setActivityFilter}
              options={[
                { value: 'all', label: 'Any time' },
                { value: '7', label: 'Last 7 days' },
                { value: '14', label: 'Last 14 days' },
                { value: '30', label: 'Last 30 days' }
              ]}
            />
            <PipelineSearchInput value={searchQuery} onChange={setSearchQuery} />
            <PillCheckbox
              icon={ShieldCheck}
              label="Preapproved"
              checked={preapprovedOnly}
              onToggle={(next) => setPreapprovedOnly(next)}
            />
            <div className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
              {totalLeads} in view
            </div>
          </div>
          <div className="flex items-center gap-2">
            {filtersApplied && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-semibold text-brand-600 transition hover:border-brand-200"
              >
                <XCircle className="h-4 w-4" aria-hidden />
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={toggleCompactMode}
              className={clsx(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition',
                compactMode
                  ? 'border-brand-200 bg-brand-50 text-brand-600'
                  : 'border-[#E2E8F0] bg-white text-slate-700 hover:border-brand-200 hover:text-brand-600'
              )}
              title="Toggle compact mode"
            >
              <span>{compactMode ? 'Compact' : 'Comfortable'}</span>
            </button>
            <button
              type="button"
              onClick={toggleGuidedMode}
              className="flex items-center gap-2 rounded-full border border-transparent bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
              Assist
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
        <div className="grid gap-4 text-[var(--hatch-text)] sm:grid-cols-3">
          <MetricCard
            label="Active Leads"
            value={heroMetrics.activeLeads.toString()}
            helper="Across current filters"
          />
          <MetricCard
            label="Avg Time in Stage"
            value={averageStageTimeCopy}
            helper="Keep SLAs on track"
          />
          <MetricCard
            label="Conversion Rate"
            value={conversionRateCopy}
            helper="Leads in the final stage"
          />
        </div>
      </section>

      {layoutError && (
        <ErrorBanner
          title="Using default lead card layout"
          detail={layoutError}
          onDismiss={() => setLayoutError(null)}
        />
      )}
      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-2">
          {!isRefreshing && debouncedHasSearch && visibleStageCount === 0 ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-6 py-10 text-center text-sm text-slate-500">
              <Search className="h-6 w-6 text-slate-400" aria-hidden />
              <p className="text-base font-semibold text-slate-700">No matches found</p>
              <p>
                No leads in this pipeline match “{trimmedSearch}”. Try another search or clear your filters.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="rounded-full border border-transparent bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div
              className={clsx(
                'grid min-w-[72rem] auto-rows-[1fr] gap-6',
                'md:grid-cols-2',
                gridStageCount >= 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2',
                gridStageCount >= 4 && '2xl:grid-cols-4'
              )}
              aria-busy={isPending || isRefreshing}
            >
              {visibleStages.map((stage) => {
                const originalIndex = selectedPipeline.stages.findIndex(
                  (candidate) => candidate.id === stage.id
                );
                const stageIndex = originalIndex === -1 ? 0 : originalIndex;
                return (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    stageIndex={stageIndex}
                    stageCount={stageCount}
                    leads={columns.get(stage.id) ?? []}
                    cardFields={cardFields}
                    onSelectLead={handleLeadCardClick}
                    activeLeadId={activeLeadId}
                    isCompact={compactMode}
                    guidedMode={guidedMode}
                    onRequestAddLead={openCreateLead}
                  />
                );
              })}
            </div>
          )}
        </div>
      </DndContext>

      {guidedMode && (
        <div className="fixed inset-x-4 bottom-8 z-[60] mx-auto max-w-2xl rounded-3xl border border-brand-200 bg-white/95 p-6 shadow-hatch-card">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <HelpCircle className="h-6 w-6" aria-hidden />
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--hatch-text)]">Guided Mode</h3>
                <p className="text-sm text-[var(--hatch-text-muted)]">
                  Drag and drop leads into highlighted stages. Hover cards for quick actions, or tap
                  the score pill to open full details.
                </p>
              </div>
              <ul className="grid gap-2 text-sm text-[var(--hatch-text-muted)] sm:grid-cols-2">
                <li>• Empty columns light up with a “Drop Lead Here” target.</li>
                <li>• Quick actions keep messaging and notes a tap away.</li>
                <li>• Filters stay sticky so you never lose context.</li>
                <li>• Use Compact mode to scan high-volume stages faster.</li>
              </ul>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                  onClick={toggleGuidedMode}
                >
                  Got it—hide tips
                </button>
                <button
                  type="button"
                  className="rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 shadow-sm transition hover:bg-brand-100"
                  onClick={toggleCompactMode}
                >
                  Toggle compact mode
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateError(null);
            setIsCreating(false);
          }
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add lead</SheetTitle>
            <SheetDescription>Capture buyer/seller intent and drop them into a pipeline stage.</SheetDescription>
          </SheetHeader>

          {createError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {createError}
            </div>
          ) : null}

          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCreateLead();
            }}
          >
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead type</label>
              <select
                value={createLeadType}
                onChange={(event) => setCreateLeadType(event.target.value as typeof createLeadType)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                disabled={isCreating}
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="BUYER">Buyer</option>
                <option value="SELLER">Seller</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">First name</label>
                <Input value={createFirstName} onChange={(e) => setCreateFirstName(e.target.value)} disabled={isCreating} />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last name</label>
                <Input value={createLastName} onChange={(e) => setCreateLastName(e.target.value)} disabled={isCreating} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                <Input
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  disabled={isCreating}
                  inputMode="email"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
                <Input value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} disabled={isCreating} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pipeline</label>
                <select
                  value={createPipelineId}
                  onChange={(event) => {
                    const nextPipelineId = event.target.value;
                    setCreatePipelineId(nextPipelineId);
                    const nextPipeline = pipelines.find((pipeline) => pipeline.id === nextPipelineId);
                    const nextStage = nextPipeline?.stages?.[0];
                    if (nextStage) {
                      setCreateStageId(nextStage.id);
                    }
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  disabled={isCreating}
                >
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stage</label>
                <select
                  value={createStageId}
                  onChange={(event) => setCreateStageId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  disabled={isCreating}
                >
                  {createStageOptions.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <SheetFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmitCreateLead}>
                {isCreating ? 'Creating…' : 'Create lead'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <LoadMoreButton
        hasNext={Boolean(nextCursor)}
        isLoading={isLoadingMore || isRefreshing}
        onClick={loadMore}
        className="ml-auto rounded-full border border-transparent bg-gradient-to-r from-[#1F5FFF] to-[#00C6A2] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(31,95,255,0.35)]"
      />

      {activeLead && (
        <LeadDrawer
          lead={activeLead}
          pipelines={pipelines}
          owners={owners}
          onClose={closeDrawer}
          onLeadUpdated={handleLeadUpdated}
        />
      )}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  icon: LucideIcon;
}

function FilterSelect({ label, value, onChange, options, icon: Icon }: FilterSelectProps) {
  return (
    <label className="group relative flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-brand-200">
      <Icon className="h-4 w-4 text-slate-500" aria-hidden />
      <span className="hidden text-xs font-medium text-slate-500 md:block">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="peer appearance-none bg-transparent pr-6 text-sm font-medium text-slate-900 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400 transition group-hover:text-brand-500" />
    </label>
  );
}

interface PillCheckboxProps {
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  icon: LucideIcon;
}

function PillCheckbox({ label, checked, onToggle, icon: Icon }: PillCheckboxProps) {
  return (
    <button
      type="button"
      className={clsx(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition',
        checked
          ? 'border-brand-200 bg-brand-50 text-brand-600 shadow'
          : 'border-[#E2E8F0] bg-white text-slate-700 hover:border-brand-200'
      )}
      onClick={() => onToggle(!checked)}
      aria-pressed={checked}
    >
      <Icon
        className={clsx('h-4 w-4', checked ? 'text-brand-600' : 'text-slate-500')}
        aria-hidden
      />
      <span className="hidden text-xs font-medium text-slate-500 md:block">
        {label}
      </span>
      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-brand-600">
        {checked ? 'On' : 'All'}
      </span>
    </button>
  );
}

interface PipelineSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function PipelineSearchInput({ value, onChange, placeholder }: PipelineSearchInputProps) {
  return (
    <label className="group relative flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-brand-200 focus-within:border-brand-300">
      <Search className="h-4 w-4 text-slate-500" aria-hidden />
      <span className="hidden text-xs font-medium text-slate-500 md:block">Search</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? 'Find a client'}
        className="w-40 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none md:w-56"
        autoComplete="off"
        spellCheck={false}
        aria-label="Search clients"
      />
    </label>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  helper: string;
}

function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-[var(--hatch-gradient)] p-4 text-white shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-white/75">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/85">{helper}</p>
    </div>
  );
}

interface StageColumnProps {
  stage: PipelineStage;
  stageIndex: number;
  stageCount: number;
  leads: LeadSummary[];
  cardFields: Array<{ field: string; label?: string; order: number; width?: number }>;
  onSelectLead: (lead: LeadSummary) => void;
  activeLeadId: string | null;
  isCompact: boolean;
  guidedMode: boolean;
  onRequestAddLead: (stageId?: string) => void;
}

function StageColumn({
  stage,
  stageIndex,
  stageCount,
  leads,
  cardFields,
  onSelectLead,
  activeLeadId,
  isCompact,
  guidedMode,
  onRequestAddLead
}: StageColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id });
  const leadCopy = `${leads.length} ${leads.length === 1 ? 'Lead' : 'Leads'}`;
  const slaCopy = stage.slaMinutes ? formatSla(stage.slaMinutes) : 'No SLA';
  const stageTitle = resolveStageTitle(stage.name);
  const pipelineLabel =
    'pipelineName' in stage ? (stage as { pipelineName?: string }).pipelineName : undefined;

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'relative flex min-h-[24rem] flex-col gap-4 rounded-3xl border border-[#E2E8F0] bg-white p-5 transition',
        isOver && 'ring-2 ring-brand-300 ring-offset-2 ring-offset-white'
      )}
    >
      <div className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              {pipelineLabel ?? 'Pipeline'}
            </p>
            <h2 className="text-lg font-semibold text-slate-900">{stageTitle}</h2>
          </div>
          <span className="rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-slate-600">
            {leadCopy}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">{slaCopy}</p>
      </div>

      <div className="relative flex flex-1 flex-col gap-3">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            stage={stage}
            stageIndex={stageIndex}
            stageCount={stageCount}
            cardFields={cardFields}
            onSelect={onSelectLead}
            isActive={lead.id === activeLeadId}
            isCompact={isCompact}
          />
        ))}
        {leads.length === 0 && (
          <div
            className={clsx(
              'flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center text-sm text-slate-500 transition',
              (isOver || guidedMode) && leads.length === 0 && 'border-brand-300 text-brand-600'
            )}
          >
            <Sparkles className="h-8 w-8 text-brand-500" aria-hidden />
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-900">No leads yet.</p>
              <p>Drag a lead in or create a new one to activate this stage.</p>
            </div>
            <button
              type="button"
              onClick={() => onRequestAddLead(stage.id)}
              className="rounded-full bg-[var(--hatch-gradient)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(31,95,255,0.35)] hover:animate-[hatch-pulse_1.8s_ease-in-out]"
            >
              Add Lead
            </button>
          </div>
        )}
        {isOver && leads.length > 0 && (
          <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/60">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white shadow">
                Drop lead here
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const mergeLeadPages = (current: LeadSummary[], incoming: LeadSummary[]) => {
  if (incoming.length === 0) {
    return current;
  }

  const seen = new Map<string, LeadSummary>();
  current.forEach((lead) => {
    seen.set(lead.id, lead);
  });
  incoming.forEach((lead) => {
    if (!seen.has(lead.id)) {
      seen.set(lead.id, lead);
    }
  });
  return Array.from(seen.values());
};

interface LeadCardProps {
  lead: LeadSummary;
  stage: PipelineStage;
  stageIndex: number;
  stageCount: number;
  cardFields: Array<{ field: string; label?: string; order: number; width?: number }>;
  onSelect: (lead: LeadSummary) => void;
  isActive: boolean;
  isCompact: boolean;
}

function LeadCard({
  lead,
  stage,
  stageIndex,
  stageCount,
  cardFields,
  onSelect,
  isActive,
  isCompact
}: LeadCardProps) {
  const stageId = lead.stage?.id ?? lead.stageId ?? stage.id;
  const pipelineId = lead.pipelineId ?? lead.stage?.pipelineId ?? stage.pipelineId;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: {
      fromStageId: stageId,
      pipelineId
    }
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const timeInStage = formatDistanceToNow(new Date(lead.stageEnteredAt ?? lead.createdAt), {
    addSuffix: true
  });
  const slaMinutes = stage.slaMinutes ?? null;
  const minutesInStage = differenceInMinutes(
    new Date(),
    new Date(lead.stageEnteredAt ?? lead.createdAt)
  );
  const slaBreached = slaMinutes !== null ? minutesInStage > slaMinutes : false;
  const bestAction = getNextBestAction(lead);

  const detailFields = useMemo(
    () =>
      cardFields.filter(
        (field) => !['owner', 'firstName', 'lastName', 'email', 'phone'].includes(field.field)
      ),
    [cardFields]
  );

  const stageTitle = resolveStageTitle(lead.stage?.name ?? stage.name);
  const stagePipelineName =
    lead.stage?.pipelineName ??
    ('pipelineName' in stage ? (stage as { pipelineName?: string }).pipelineName : undefined);

  const renderFieldValue = useCallback(
    (field: string) => {
      switch (field) {
        case 'firstName':
          return lead.firstName ?? '—';
        case 'lastName':
          return lead.lastName ?? '—';
        case 'email':
          return lead.email ?? '—';
        case 'phone':
          return lead.phone ?? '—';
        case 'stage':
          return stageTitle;
        case 'pipelineName':
          return lead.pipelineName ?? stagePipelineName ?? '—';
        case 'source':
          return (lead as { source?: string | null }).source ?? '—';
        case 'owner':
          return lead.owner?.name ?? 'Unassigned';
        case 'score':
          return typeof lead.score === 'number' ? Math.round(lead.score) : '—';
        case 'scoreTier':
          return lead.scoreTier ?? '—';
        case 'lastActivityAt':
          return lead.lastActivityAt
            ? formatDistanceToNow(new Date(lead.lastActivityAt), { addSuffix: true })
            : '—';
        case 'createdAt':
          return formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true });
        default: {
          const value = (lead as Record<string, unknown>)[field];
          if (value === null || value === undefined || value === '') {
            return '—';
          }
          if (typeof value === 'object') {
            try {
              return JSON.stringify(value);
            } catch {
              return '—';
            }
          }
          return String(value);
        }
      }
    },
    [lead, stagePipelineName, stageTitle]
  );

  const ownerName = lead.owner?.name ?? 'Unassigned';
  const ownerInitials = getInitials(ownerName);
  const stageProgressPercent =
    stageCount === 0 ? 0 : Math.min(100, ((stageIndex + 1) / stageCount) * 100);
  const scoreTier = (lead.scoreTier ?? '—').toUpperCase();
  const scoreValue =
    typeof lead.score === 'number' && Number.isFinite(lead.score)
      ? Math.round(lead.score)
      : null;
  const leadType = (lead.leadType ?? 'UNKNOWN').toUpperCase();
  const leadTypeLabel = leadType === 'BUYER' ? 'Buyer' : leadType === 'SELLER' ? 'Seller' : 'Unknown';
  const leadTypeTone =
    leadType === 'BUYER'
      ? 'bg-indigo-50 text-indigo-700'
      : leadType === 'SELLER'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-slate-100 text-slate-700';
  const contactChips = [
    lead.email ? { icon: Mail as LucideIcon, label: lead.email } : null,
    lead.phone ? { icon: Phone as LucideIcon, label: lead.phone } : null
  ].filter(Boolean) as Array<{ icon: LucideIcon; label: string }>;
  const visibleContactChips = isCompact ? contactChips.slice(0, 1) : contactChips;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'group cursor-pointer rounded-2xl border border-[var(--hatch-border)] bg-white p-4 text-sm shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 md:cursor-grab',
        isDragging && 'pointer-events-none rotate-1 scale-[1.02] opacity-90 shadow-xl',
        !isDragging && isActive && 'ring-2 ring-brand-500 ring-offset-2',
        isCompact && 'p-3'
      )}
      onClick={() => onSelect(lead)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(lead);
        }
      }}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold uppercase text-brand-600">
            {ownerInitials}
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-base font-semibold text-[var(--hatch-text)]">
                {lead.firstName ?? '—'} {lead.lastName ?? ''}
              </p>
              <p className="text-xs text-[var(--hatch-text-muted)]">
                {stagePipelineName ?? 'Pipeline'} • {stageTitle}
              </p>
            </div>
            {visibleContactChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {visibleContactChips.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-[#eef3ff] px-2 py-1 text-xs font-medium text-[var(--hatch-text-muted)]"
                  >
                    <Icon className="h-3.5 w-3.5 text-brand-500" aria-hidden />
                    <span className="max-w-[160px] truncate">{label}</span>
                  </span>
                ))}
              </div>
            )}
            <span className={clsx('inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold', leadTypeTone)}>
              <Target className="h-3.5 w-3.5 opacity-80" aria-hidden />
              {leadTypeLabel}
            </span>
            {!isCompact && bestAction && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                <Sparkles className="h-3 w-3" aria-hidden />
                {bestAction}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={clsx('rounded px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]', getTierClass(scoreTier))}>
            {scoreValue !== null ? `${scoreTier} · ${scoreValue}` : scoreTier}
          </span>
          {slaMinutes !== null && (
            <span
              className={clsx(
                'rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em]',
                slaBreached ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              )}
            >
              {slaBreached ? 'SLA OVERDUE' : 'SLA ON TRACK'}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Message lead"
              onClick={(event) => event.stopPropagation()}
              className="rounded-full border border-[var(--hatch-border)] bg-white p-1.5 text-[var(--hatch-text-muted)] transition hover:border-brand-200 hover:text-brand-600"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
            </button>
            <Link
              href={`/people/${lead.id}`}
              aria-label="Open lead"
              onClick={(event) => event.stopPropagation()}
              className="rounded-full border border-[var(--hatch-border)] bg-white p-1.5 text-[var(--hatch-text-muted)] transition hover:border-brand-200 hover:text-brand-600"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </Link>
            <button
              type="button"
              title="More actions"
              onClick={(event) => event.stopPropagation()}
              className="rounded-full border border-[var(--hatch-border)] bg-white p-1.5 text-[var(--hatch-text-muted)] transition hover:border-brand-200 hover:text-brand-600"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {!isCompact && detailFields.length > 0 && (
        <div className="mt-3 grid gap-3 text-xs">
          {detailFields.map((field) => (
            <div key={field.field} className="flex items-center justify-between gap-3">
              <span className="text-[var(--hatch-text-muted)]">{field.label ?? field.field}</span>
              <span className="max-w-[50%] truncate text-[var(--hatch-text)] font-medium">
                {renderFieldValue(field.field)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--hatch-text-muted)]">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/10 text-[0.7rem] font-semibold uppercase text-brand-600">
            {ownerInitials}
          </span>
          <span className="font-medium text-[var(--hatch-text)]">{ownerName}</span>
        </div>
        <span>{timeInStage}</span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-[var(--hatch-text-muted)]">
          <span>
            Step {stageIndex + 1} of {stageCount}
          </span>
          <span>{stageTitle}</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--hatch-border)]/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
            style={{ width: `${stageProgressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function getTierClass(tier: string) {
  switch (tier) {
    case 'A':
      return 'bg-emerald-100 text-emerald-700';
    case 'B':
      return 'bg-blue-100 text-blue-700';
    case 'C':
      return 'bg-amber-100 text-amber-700';
    case 'D':
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

const STAGE_TITLE_OVERRIDES: Record<string, string> = {
  S1: 'New Lead / Inquiry',
  S2: 'Contacted',
  S3: 'Engaged',
  S4: 'Qualified',
  S5: 'Appointment Set',
  S6: 'Showing / Demo',
  S7: 'Offer Made',
  S8: 'Negotiation',
  S9: 'Under Contract',
  S10: 'Closed / Won'
};

function resolveStageTitle(rawName?: string | null): string {
  if (!rawName) {
    return 'Stage';
  }

  const trimmed = rawName.trim();
  if (STAGE_TITLE_OVERRIDES[trimmed]) {
    return STAGE_TITLE_OVERRIDES[trimmed];
  }

  const codeMatch = trimmed.match(/^S\d+/i);
  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    const remainder = trimmed.slice(codeMatch[0].length).replace(/^[\s–—\-\/|.]+/, '').trim();
    if (remainder.length > 0) {
      return remainder;
    }
    if (STAGE_TITLE_OVERRIDES[code]) {
      return STAGE_TITLE_OVERRIDES[code];
    }
    return code;
  }

  return trimmed.replace(/^[\s–—\-\/|.]+/, '').trim() || trimmed;
}

function formatMinutesToHuman(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '—';
  }
  if (minutes >= 1440) {
    const days = minutes / 1440;
    return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
  }
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }
  return `${Math.max(1, Math.round(minutes))}m`;
}

function formatConversionRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0%';
  }
  return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`;
}

function formatSla(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 'No SLA';
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours > 0 && remaining > 0) {
    return `SLA ${hours}h ${remaining}m`;
  }
  if (hours > 0) {
    return `SLA ${hours}h`;
  }
  return `SLA ${minutes}m`;
}

function getInitials(name: string): string {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return initials || 'NA';
}

function getNextBestAction(lead: LeadSummary): string | null {
  const listingViews = lead.activityRollup?.last7dListingViews ?? 0;
  const sessions = lead.activityRollup?.last7dSessions ?? 0;
  const stageName = lead.stage?.name?.toLowerCase() ?? '';

  if (lead.preapproved && stageName.includes('new')) {
    return 'Make intro call';
  }
  if (listingViews >= 3 && !stageName.includes('showing')) {
    return 'Offer a tour';
  }
  if (sessions === 0 && stageName.includes('nurture')) {
    return 'Send market update';
  }
  if (lead.scoreTier === 'A' && !stageName.includes('offer')) {
    return 'Discuss offer strategy';
  }
  return null;
}
