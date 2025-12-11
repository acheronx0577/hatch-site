"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Loader2, RefreshCw } from 'lucide-react';

import { PersonaChatPanel } from '@/components/personas/PersonaChatPanel';
import { useAiEmployees, type AiPersona } from '@/hooks/use-ai-employees';
import { useAiActions } from '@/hooks/use-ai-actions';
import { useToast } from '@/components/ui/use-toast';
import type {
  AiEmployeeAction,
  AiEmployeeTemplate,
  AiEmployeeUsageStats
} from '@/lib/api/ai-employees';
import {
  AiEmployeesDisabledError,
  getAiEmployeeUsageStats
} from '@/lib/api/ai-employees';
import type { PersonaContext } from '@/lib/personas/events';
import type { PersonaCitation, PersonaSnippet } from '@/lib/personas/types';
import { PersonaFace, templateToPersonaId } from './PersonaFace';

type PersonaDockProps = {
  debug?: boolean;
  header?: ReactNode;
};

export function PersonaDock({ debug = false, header }: PersonaDockProps) {
  const [context, setContext] = useState<PersonaContext | undefined>(undefined);
  const [snippets, setSnippets] = useState<PersonaSnippet[]>([]);
  const [citations, setCitations] = useState<PersonaCitation[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<AiEmployeeUsageStats[] | null>(null);
  const [usageDisabled, setUsageDisabled] = useState(false);
  const {
    personas,
    loading: personaLoading,
    error: personaError,
    refresh: refreshPersonas,
    disabled: employeesDisabled
  } = useAiEmployees();
  const {
    actions,
    loading: actionsLoading,
    error: actionsError,
    refresh: refreshActions,
    approveAction,
    rejectAction,
    disabled: actionsDisabled
  } = useAiActions();
  const { toast } = useToast();
  const isRefreshing = personaLoading || actionsLoading;

  useEffect(() => {
    const snippetHandler = (event: Event) => {
      const detail = (event as CustomEvent<PersonaSnippet[]>).detail ?? [];
      setSnippets(detail);
    };
    const citationHandler = (event: Event) => {
      const detail = (event as CustomEvent<PersonaCitation[]>).detail ?? [];
      setCitations(detail);
    };
    const contextHandler = (event: Event) => {
      const detail = (event as CustomEvent<PersonaContext | undefined>).detail ?? undefined;
      setContext(detail);
    };
    window.addEventListener('persona:snippets', snippetHandler);
    window.addEventListener('persona:citations', citationHandler);
    window.addEventListener('persona:context', contextHandler);
    return () => {
      window.removeEventListener('persona:snippets', snippetHandler);
      window.removeEventListener('persona:citations', citationHandler);
      window.removeEventListener('persona:context', contextHandler);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAiEmployeeUsageStats()
      .then((data) => {
        if (mounted) {
          setUsageStats(data);
          setUsageDisabled(false);
        }
      })
      .catch((error) => {
        if (!mounted) return;
        if (error instanceof AiEmployeesDisabledError) {
          setUsageDisabled(true);
        }
        setUsageStats([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedKey && personas.length > 0) {
      setSelectedKey(personas[0].template.key);
    }
  }, [personas, selectedKey]);

  const refreshAll = useCallback(() => {
    refreshPersonas();
    refreshActions();
  }, [refreshPersonas, refreshActions]);

  const notifyExecution = useCallback(
    (action: AiEmployeeAction) => {
      const status = (action.status ?? '').toLowerCase();
      if (status === 'executed') {
        toast({
          title: 'Action executed',
          description: 'The AI tool ran successfully.'
        });
      } else if (status === 'failed') {
        toast({
          variant: 'destructive',
          title: 'Action failed',
          description: action.errorMessage ?? 'Tool execution failed.'
        });
      } else {
        toast({
          title: 'Action approved',
          description: `Status: ${action.status}`
        });
      }
    },
    [toast]
  );

  const handleApproveAction = useCallback(
    async (actionId: string) => {
      try {
        const updated = (await approveAction(actionId)) as AiEmployeeAction;
        notifyExecution(updated);
        return updated;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to approve action.';
        toast({
          variant: 'destructive',
          title: 'Approval failed',
          description: message
        });
        throw error;
      }
    },
    [approveAction, notifyExecution, toast]
  );

  const handleRejectAction = useCallback(
    async (actionId: string) => {
      try {
        const updated = (await rejectAction(actionId)) as AiEmployeeAction;
        toast({
          title: 'Action rejected',
          description: 'The AI suggestion was dismissed.'
        });
        return updated;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reject action.';
        toast({
          variant: 'destructive',
          title: 'Rejection failed',
          description: message
        });
        throw error;
      }
    },
    [rejectAction, toast]
  );

  const selectedPersona = useMemo(
    () =>
      personas.find((persona) => persona.template.key === selectedKey) ??
      personas[0] ??
      null,
    [personas, selectedKey]
  );

  const personaUsage = selectedPersona
    ? usageStats?.find((stat) => stat.personaKey === selectedPersona.template.key)
    : undefined;

  const aiEmployeesDisabled = employeesDisabled || actionsDisabled || usageDisabled;

  if (aiEmployeesDisabled) {
    return (
      <div className="flex w-full flex-col overflow-hidden rounded-xl border bg-white shadow-lg">
        <div className="border-b px-4 py-3">
          {header ?? <span className="text-sm font-semibold text-slate-700">AI Personas</span>}
        </div>
        <DisabledNotice onRetry={refreshAll} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border bg-white shadow-lg">
      <div className="border-b px-4 py-3">
          {header ?? <span className="text-sm font-semibold text-slate-700">AI Personas</span>}
      </div>

      <PersonaHeader
        persona={selectedPersona}
        loading={isRefreshing}
        error={personaError}
        onRefresh={refreshAll}
      />

      <PersonaSwitcher
        personas={personas}
        selectedKey={selectedPersona?.template.key ?? null}
        onSelect={setSelectedKey}
        loading={personaLoading}
      />

      {context && <ContextBanner context={context} />}
      {personaUsage && <UsageHint usage={personaUsage} />}

      <div className="border-t px-4 py-4">
        {selectedPersona ? (
          <PersonaChatPanel persona={selectedPersona} context={context} onActionsCreated={refreshActions} />
        ) : (
          <EmptyState loading={personaLoading} />
        )}
      </div>

      {selectedPersona && <AllowedTools persona={selectedPersona} />}

      <ActionTray
        actions={actions}
        loading={actionsLoading}
        error={actionsError}
        onApprove={handleApproveAction}
        onReject={handleRejectAction}
        onRefresh={refreshActions}
      />

      {debug && (snippets.length > 0 || citations.length > 0) && (
        <DebugPanel snippets={snippets} citations={citations} />
      )}
    </div>
  );
}

function DisabledNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-base font-semibold text-slate-900">
        AI Personas are disabled in this environment.
      </p>
      <p className="text-sm text-slate-500">
        Enable the feature flag or switch environments to access AI Personas.
      </p>
      {onRetry && (
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => onRetry()}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function PersonaHeader({
  persona,
  loading,
  error,
  onRefresh
}: {
  persona: AiPersona | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.4em] text-slate-400">Persona</p>
        <p className="text-base font-semibold text-slate-900">
          {persona?.template.displayName ?? 'Select an AI persona'}
        </p>
        <p className="text-xs text-slate-500">
          {persona?.template.description ??
            'Connect a template to this tenant to start chatting with AI personas.'}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Sync
      </button>
    </div>
  );
}

function PersonaSwitcher({
  personas,
  selectedKey,
  onSelect,
  loading
}: {
  personas: AiPersona[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading: boolean;
}) {
  if (!personas.length && !loading) {
    return (
      <div className="border-t px-4 py-3 text-xs text-slate-500">
        No AI personas assigned to this tenant yet.
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto border-t px-4 py-3">
      {personas.map((persona) => (
        <PersonaCard
          key={persona.template.id}
          persona={persona}
          active={persona.template.key === selectedKey}
          onSelect={() => onSelect(persona.template.key)}
        />
      ))}
    </div>
  );
}

function ContextBanner({ context }: { context: PersonaContext }) {
  const entityLabel =
    context.entityType && context.entityId ? `${context.entityType} · ${context.entityId}` : context.entityId ?? null;
  return (
    <div className="border-y border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
      <p className="font-semibold text-slate-800">
        Context:{' '}
        <span className="font-normal text-slate-600">
          {context.summary ?? `${context.surface} surface`}
        </span>
      </p>
      {entityLabel && <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{entityLabel}</p>}
    </div>
  );
}

function UsageHint({ usage }: { usage: AiEmployeeUsageStats }) {
  const successRate = usage.totalActions
    ? Math.round((usage.successfulActions / usage.totalActions) * 100)
    : 0;
  return (
    <div className="border-b border-slate-100 bg-white px-4 py-2 text-xs text-slate-600">
      {usage.totalActions ? (
        <span>
          Last 30d: <span className="font-semibold text-slate-900">{usage.totalActions}</span> actions ·{' '}
          <span className="text-emerald-600">{successRate}% success</span>
        </span>
      ) : (
        <span>No recent usage for this persona.</span>
      )}
    </div>
  );
}

function PersonaCard({
  persona,
  active,
  onSelect
}: {
  persona: AiPersona;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = getPersonaMeta(persona.template);
  const personaId = templateToPersonaId(persona.template);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-w-[200px] flex-1 flex-col gap-2 rounded-2xl border px-3 py-2 text-left text-xs transition ${
        active ? 'border-slate-900 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {personaId ? (
        <PersonaFace personaId={personaId} size="sm" animated active={active} />
      ) : (
        <span
          className={`${meta.shapeClass} inline-flex items-center justify-center text-[11px] font-semibold uppercase text-white`}
          style={meta.shapeStyle}
        >
          {meta.initials}
        </span>
      )}
      <div>
        <p className="text-sm font-semibold text-slate-900">{persona.template.displayName}</p>
        <p className="text-[11px] text-slate-500">Tone: {meta.tone ?? 'balanced'}</p>
        {!persona.instance && (
          <p className="text-[11px] text-amber-600">Enable for this tenant to chat.</p>
        )}
      </div>
    </button>
  );
}

function AllowedTools({ persona }: { persona: AiPersona }) {
  return (
    <div className="border-t px-4 py-3 text-xs text-slate-500">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Allowed tools</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {persona.template.allowedTools.length > 0 ? (
          persona.template.allowedTools.map((tool) => (
            <span
              key={tool}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              {tool}
            </span>
          ))
        ) : (
          <span className="text-slate-400">No tools enabled yet.</span>
        )}
      </div>
    </div>
  );
}

function ActionTray({
  actions,
  loading,
  error,
  onApprove,
  onReject,
  onRefresh
}: {
  actions: AiEmployeeAction[];
  loading: boolean;
  error: string | null;
  onApprove: (id: string) => Promise<AiEmployeeAction | void>;
  onReject: (id: string) => Promise<AiEmployeeAction | void>;
  onRefresh: () => void;
}) {
  return (
    <div className="border-t px-4 py-3 text-xs text-slate-600">
      <div className="mb-2 flex items-center justify-between">
        <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Approvals</p>
        <p className="text-sm font-semibold text-slate-900">Pending persona actions</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>
      {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}
      {actions.length === 0 ? (
        <p className="text-[11px] text-slate-500">No pending approvals.</p>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} onApprove={onApprove} onReject={onReject} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  action,
  onApprove,
  onReject
}: {
  action: AiEmployeeAction;
  onApprove: (id: string) => Promise<AiEmployeeAction | void>;
  onReject: (id: string) => Promise<AiEmployeeAction | void>;
}) {
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const normalizedStatus = (action.status ?? '').toLowerCase();
  const actionable = normalizedStatus === 'proposed' || normalizedStatus === 'requires-approval';

  const run = async (kind: 'approve' | 'reject') => {
    setPending(kind);
    try {
      if (kind === 'approve') {
        await onApprove(action.id);
      } else {
        await onReject(action.id);
      }
    } catch {
      // toast handled upstream
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="flex items-center justify-between text-[12px] font-semibold text-slate-700">
        <span>{action.actionType}</span>
        <ActionStatusBadge status={action.status} />
      </div>
      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950/5 p-2 text-[11px] text-slate-600">
        {JSON.stringify(action.payload, null, 2)}
      </pre>
      {action.errorMessage && (
        <p className="mt-2 text-[11px] text-red-600">{action.errorMessage}</p>
      )}
      {action.executedAt && (
        <p className="mt-2 text-[11px] text-slate-500">
          Executed {new Date(action.executedAt).toLocaleString()}
        </p>
      )}
      {actionable ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
            onClick={() => run('approve')}
            disabled={pending !== null}
          >
            {pending === 'approve' ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : 'Approve'}
          </button>
          <button
            type="button"
            className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-60"
            onClick={() => run('reject')}
            disabled={pending !== null}
          >
            {pending === 'reject' ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : 'Reject'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ActionStatusBadge({ status }: { status: string }) {
  const normalized = (status ?? '').toLowerCase();
  const variants: Record<string, { label: string; className: string }> = {
    executed: { label: 'Executed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    failed: { label: 'Failed', className: 'bg-red-50 text-red-600 border-red-200' },
    approved: { label: 'Approved', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    rejected: { label: 'Rejected', className: 'bg-red-50 text-red-600 border-red-200' },
    'requires-approval': {
      label: 'Needs approval',
      className: 'bg-amber-50 text-amber-700 border-amber-200'
    },
    proposed: { label: 'Proposed', className: 'bg-slate-100 text-slate-600 border-slate-200' }
  };
  const variant = variants[normalized] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600 border-slate-200'
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${variant.className}`}>
      {variant.label}
    </span>
  );
}

function DebugPanel({
  snippets,
  citations
}: {
  snippets: PersonaSnippet[];
  citations: PersonaCitation[];
}) {
  return (
    <div className="space-y-2 border-t bg-slate-50 px-3 py-3 text-xs">
      {snippets.length > 0 && (
        <div>
          <div className="mb-1 font-semibold uppercase tracking-wide">Grounding snippets</div>
          <ul className="max-h-32 space-y-1 overflow-auto pr-2">
            {snippets.map((snippet, index) => (
              <li key={snippet.id ?? `${index}-${snippet.content.slice(0, 10)}`} className="rounded border bg-white p-2">
                <div className="text-[10px] uppercase text-slate-500">
                  #{index + 1} · score {typeof snippet.score === 'number' ? snippet.score.toFixed(3) : '-'}
                </div>
                <div className="whitespace-pre-wrap text-slate-700">{snippet.content}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {citations.length > 0 && (
        <div>
          <div className="mb-1 font-semibold uppercase tracking-wide">Citations</div>
          <ul className="max-h-24 space-y-1 overflow-auto pr-2">
            {citations.map((citation, index) => (
              <li
                key={citation.id ?? `${citation.entityId}-${index}`}
                className="flex items-center justify-between rounded border bg-white p-2"
              >
                <span>
                  #{index + 1} · {citation.entityType}:{citation.entityId}
                </span>
                <span className="text-[11px] text-slate-500">
                  score {typeof citation.score === 'number' ? citation.score.toFixed(3) : '-'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading personas…
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-sm text-slate-500">
      Connect AI personas to this workspace to start chatting in real time.
    </div>
  );
}

type PersonaMeta = {
  color: string;
  initials: string;
  tone?: string;
  shapeClass: string;
  shapeStyle: { backgroundColor: string; clipPath?: string };
};

function getPersonaMeta(template?: AiEmployeeTemplate): PersonaMeta {
  const settings = (template?.defaultSettings ?? {}) as Record<string, unknown>;
  const getString = (key: string): string | undefined => {
    const value = settings[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const shape = getString('avatarShape');
  const color = getString('personaColor') ?? '#0F172A';
  const initials =
    getString('avatarInitial') ??
    template?.displayName?.split(' ')?.[0]?.[0] ??
    template?.displayName?.slice(0, 1) ??
    'AI';

  return {
    color,
    initials,
    tone: getString('tone'),
    shapeClass: buildShapeClass(shape),
    shapeStyle: {
      backgroundColor: color,
      clipPath: shape === 'hexagon' ? 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' : undefined
    }
  };
}

function buildShapeClass(shape?: string) {
  switch (shape) {
    case 'pill':
      return 'rounded-full px-4 py-1.5';
    case 'square':
      return 'h-10 w-10 rounded-md';
    case 'rounded-square':
      return 'h-10 w-10 rounded-2xl';
    case 'hexagon':
      return 'h-10 w-10';
    case 'circle':
    default:
      return 'h-10 w-10 rounded-full';
  }
}
