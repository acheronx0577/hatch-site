"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

import { CopilotPanel } from './CopilotPanel';
import { PersonaSelector } from './PersonaSelector';
import { AiPersonaFace } from '@/components/ai/AiPersonaFace';
import { useAiEmployees, type AiPersona } from '@/hooks/useAiEmployees';
import { useAiActions } from '@/hooks/useAiActions';
import { useToast } from '@/components/ui/use-toast';
import type {
  AiEmployeeAction,
  AiEmployeeTemplate,
  AiEmployeeUsageStats
} from '@/lib/api/hatch';
import { getAiEmployeeUsageStats } from '@/lib/api/hatch';
import { ApiError } from '@/lib/api/errors';
import type { CopilotContext } from '@/lib/copilot/events';
import { PERSONAS, type PersonaConfig, type PersonaId } from '@/lib/ai/aiPersonas';
import { cn, resolveUserIdentity } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const TOOL_CATALOG: Record<
  string,
  { label: string; description: string; comingSoon?: boolean }
> = {
  lead_add_note: {
    label: 'Add note to lead',
    description: 'Logs conversational context after each call.'
  },
  lead_assign: {
    label: 'Reassign lead',
    description: 'Moves ownership to another teammate.'
  },
  lead_follow_up_task: {
    label: 'Create follow-up task',
    description: 'Books a reminder if touchpoints are overdue.'
  },
  send_email: {
    label: 'Send branded email',
    description: 'Lets Copilot send outreach without review yet.',
    comingSoon: true
  }
};

const normalizePersonaKey = (key: string): PersonaId =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase() as PersonaId;

export function CopilotDock({ debug = false }: { debug?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [context, setContext] = useState<CopilotContext | undefined>(undefined);
  const [usageStats, setUsageStats] = useState<AiEmployeeUsageStats[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<PersonaId | null>(PERSONAS[0]?.id ?? null);
  const [chatMode, setChatMode] = useState<'team' | 'direct'>('team');
  const [lastDirectKey, setLastDirectKey] = useState<PersonaId>(() => {
    const fallback = PERSONAS.find((persona) => persona.id !== 'hatch_assistant')?.id;
    return fallback ?? 'hatch_assistant';
  });
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [dockSize, setDockSize] = useState({ width: 520, height: 600 });
  const [isResizing, setIsResizing] = useState(false);
  const {
    personas,
    loading: personaLoading,
    error: personaError,
    refresh: refreshPersonas
  } = useAiEmployees();
  const {
    actions,
    loading: actionsLoading,
    error: actionsError,
    refresh: refreshActions,
    approveAction,
    rejectAction
  } = useAiActions();
  const { toast } = useToast();
  const { session, user, activeMembership } = useAuth();

  const senderName = useMemo(() => {
    const { displayName } = resolveUserIdentity(session?.profile ?? {}, user?.email ?? undefined, 'Your Account');
    return displayName || undefined;
  }, [session?.profile, user?.email]);
  const isRefreshing = personaLoading || actionsLoading;
  const personaMap = useMemo(() => {
    return new Map<PersonaId, AiPersona>(
      personas.map((persona) => [persona.template.key as PersonaId, persona])
    );
  }, [personas]);
  const personaStatuses = useMemo(() => {
    const result: Partial<Record<PersonaId, 'ready' | 'provisioning'>> = {};
    PERSONAS.forEach((config) => {
      const instance = personaMap.get(config.id)?.instance;
      result[config.id] = instance ? 'ready' : 'provisioning';
    });
    return result;
  }, [personaMap]);

  useEffect(() => {
    const openHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ personaId?: PersonaId }>).detail;
      if (detail?.personaId) {
        setSelectedKey(detail.personaId);
      }
      setOpen(true);
    };
    const closeHandler = () => setOpen(false);
    const toggleHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ personaId?: PersonaId }>).detail;
      if (detail?.personaId) {
        setSelectedKey(detail.personaId);
      }
      setOpen((prev) => !prev);
    };
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<CopilotContext | undefined>).detail ?? undefined;
      setContext(detail);
    };
    window.addEventListener('copilot:context', onContext);
    window.addEventListener('copilot:open', openHandler);
    window.addEventListener('copilot:close', closeHandler);
    window.addEventListener('copilot:toggle', toggleHandler);
    return () => {
      window.removeEventListener('copilot:context', onContext);
      window.removeEventListener('copilot:open', openHandler);
      window.removeEventListener('copilot:close', closeHandler);
      window.removeEventListener('copilot:toggle', toggleHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showDetails) {
          setShowDetails(false);
          return;
        }
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, showDetails]);

  useEffect(() => {
    // Disable usage stats entirely to avoid 403 noise in dev/demo.
    setUsageStats([]);
  }, [activeMembership?.role, session?.user?.globalRole]);

  useEffect(() => {
    if (selectedKey) {
      return;
    }
    const preferred = PERSONAS.find((config) => personaMap.has(config.id));
    if (preferred) {
      setSelectedKey(preferred.id);
    } else if (PERSONAS[0]) {
      setSelectedKey(PERSONAS[0].id);
    }
  }, [personaMap, selectedKey]);

  const refreshAll = useCallback(() => {
    refreshPersonas();
    refreshActions();
  }, [refreshPersonas, refreshActions]);

  const switchToTeam = useCallback(() => {
    if (selectedKey) {
      setLastDirectKey(selectedKey);
    }
    setChatMode('team');
    setSelectedKey('hatch_assistant');
  }, [selectedKey]);

  const switchToDirect = useCallback(() => {
    setChatMode('direct');
    setSelectedKey(lastDirectKey);
  }, [lastDirectKey]);

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
        const updated = await approveAction(actionId);
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
        const updated = await rejectAction(actionId);
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

  const selectedConfig = useMemo(
    () => PERSONAS.find((persona) => persona.id === selectedKey) ?? PERSONAS[0] ?? null,
    [selectedKey]
  );

  const selectedPersona = useMemo(() => {
    if (!selectedConfig) {
      return null;
    }
    return personaMap.get(selectedConfig.id) ?? buildStubPersona(selectedConfig);
  }, [personaMap, selectedConfig]);

  const personaUsage = useMemo(() => {
    if (!selectedConfig || !usageStats) {
      return undefined;
    }
    return usageStats.find((stat) => stat.personaKey === selectedConfig.id);
  }, [selectedConfig, usageStats]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const newHeight = window.innerHeight - e.clientY;
      setDockSize({
        width: Math.max(400, Math.min(800, newWidth)),
        height: Math.max(400, Math.min(window.innerHeight * 0.9, newHeight))
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open Hatch Copilot"
          className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-40 flex h-14 sm:h-12 items-center gap-2 rounded-full bg-[#1F5FFF] px-4 sm:px-4 text-sm font-medium text-white shadow-lg antialiased transition-all duration-200 scale-100 hover:scale-105 active:scale-95"
          onClick={() => setOpen(true)}
        >
          <AiPersonaFace personaId="hatch_assistant" size="sm" animated />
          <span className="hidden sm:inline">Open Copilot</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-0 right-0 left-0 sm:left-auto sm:bottom-6 sm:right-6 z-40 flex flex-col items-end" onClick={() => setOpen(false)}>
          <div
            className="pointer-events-auto w-full sm:w-auto px-0 sm:px-0 pb-0 relative"
            style={{
              width: window.innerWidth < 640 ? '100%' : `${dockSize.width}px`,
              height: window.innerWidth < 640 ? '100vh' : `${dockSize.height}px`
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative h-full min-h-0 overflow-hidden rounded-t-2xl sm:rounded-[28px] border border-white/25 bg-white/55 shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur-xl">
              {/* Glass highlights */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-white/0" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.18),transparent_55%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_110%_40%,rgba(236,72,153,0.12),transparent_45%)]" />

              <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
              {/* Resize handle */}
              <div
                className="hidden sm:block absolute left-0 top-0 w-4 h-4 cursor-nwse-resize z-50 hover:bg-white/25 transition-colors"
                onMouseDown={handleResizeStart}
                style={{
                  borderTopLeftRadius: '28px'
                }}
              >
                <svg
                  className="absolute left-1 top-1 w-2 h-2 text-slate-400"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <circle cx="2" cy="2" r="1.5" />
                  <circle cx="8" cy="2" r="1.5" />
                  <circle cx="2" cy="8" r="1.5" />
                </svg>
              </div>

              {/* Compact header */}
              <div className="flex-none border-b border-white/20 bg-white/25 px-3 py-1.5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center rounded-full border border-white/20 bg-white/25 p-0.5 text-[12px] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={switchToDirect}
                      className={cn(
                        'rounded-full px-3 py-1 font-semibold transition',
                        chatMode === 'direct'
                          ? 'bg-white/45 text-slate-900 shadow-sm'
                          : 'text-slate-700 hover:bg-white/25'
                      )}
                      title="Single agent chat"
                    >
                      Single
                    </button>
                    <button
                      type="button"
                      onClick={switchToTeam}
                      className={cn(
                        'rounded-full px-3 py-1 font-semibold transition',
                        chatMode === 'team'
                          ? 'bg-white/45 text-slate-900 shadow-sm'
                          : 'text-slate-700 hover:bg-white/25'
                      )}
                      title="Team chat (mention personas with @)"
                    >
                      Team
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {isRefreshing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    <button onClick={refreshAll} className="rounded-full p-1 hover:bg-white/30" title="Refresh">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-white/30" title="Close">
                      <span className="text-xs">✕</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Compact persona selector */}
              <div className="flex-none border-b border-white/20 bg-white/15 px-2 py-1.5 backdrop-blur-xl">
                <div className="flex gap-2 overflow-x-auto scrollbar-thin py-1">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (chatMode === 'team') {
                          setSelectedKey('hatch_assistant');
                          if (p.id !== 'hatch_assistant') {
                            setPrefillMessage(`@${p.shortName} `);
                          } else {
                            setPrefillMessage(null);
                          }
                          return;
                        }
                        setSelectedKey(p.id);
                        setLastDirectKey(p.id);
                      }}
                      className={cn(
                        'flex-none flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition whitespace-nowrap border',
                        (chatMode === 'team' ? selectedConfig?.id === p.id && p.id === 'hatch_assistant' : selectedConfig?.id === p.id)
                          ? "border-white/30 bg-white/30 text-slate-900 shadow-sm"
                          : "border-white/20 bg-white/10 text-slate-700 hover:bg-white/20"
                      )}
                    >
                      <AiPersonaFace
                        personaId={p.id}
                        size="md"
                        animated
                        active={chatMode === 'team' ? selectedConfig?.id === p.id && p.id === 'hatch_assistant' : selectedConfig?.id === p.id}
                      />
                      {p.shortName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat area - priority */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {selectedPersona && selectedConfig ? (
                  <CopilotPanel
                    persona={selectedPersona}
                    personaConfig={selectedConfig}
                    allPersonas={personas}
                    context={context}
                    className="h-full"
                    senderName={senderName}
                    chatMode={chatMode}
                    prefill={prefillMessage}
                    onPrefillConsumed={() => setPrefillMessage(null)}
                  />
                ) : (
                  <EmptyState loading={personaLoading} />
                )}
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetails && (
        <ToolsDrawer
          persona={selectedPersona}
          actions={actions}
          loading={actionsLoading}
          error={actionsError}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
          onRefresh={refreshActions}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
}

function ChatHeader({
  persona,
  personaConfig,
  context,
  onClose,
  onRefresh,
  onViewDetails,
  isRefreshing,
  personaError
}: {
  persona: AiPersona | null;
  personaConfig?: PersonaConfig;
  context?: CopilotContext;
  onClose: () => void;
  onRefresh: () => void;
  onViewDetails: () => void;
  isRefreshing: boolean;
  personaError: string | null;
}) {
  const contextLabel = getContextLabel(context) ?? 'Workspace · tenant scoped';
  const personaLabel = personaConfig?.name ?? persona?.template.displayName ?? 'AI Employee';
  return (
    <header className="flex items-start justify-between border-b border-slate-100 bg-white/90 px-5 py-4">
      <div className="pr-4">
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Agent Copilot</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">{personaLabel}</h2>
            {personaError && <span className="text-xs text-red-600">{personaError}</span>}
          </div>
          <p className="text-xs text-slate-500">{contextLabel}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? <Loader2 className="mr-2 inline h-3 w-3 animate-spin" /> : null}
          Sync
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          onClick={onViewDetails}
        >
          View tools & approvals
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </header>
  );
}

function ContextBanner({ context }: { context: CopilotContext }) {
  const label = getContextLabel(context);
  if (!label) return null;
  return (
    <div className="border-b border-slate-100 bg-white/70 px-5 py-2 text-xs text-slate-600">
      <span className="font-semibold text-slate-800">Context:</span> {label}
    </div>
  );
}

function PersonaStatsStrip({ usage }: { usage: AiEmployeeUsageStats }) {
  const stats = buildWorkspaceStats(usage);
  return (
    <div className="border-b border-slate-100 bg-white/90 px-5 py-3">
      <div className="grid grid-cols-3 gap-3 text-sm">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {stat.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolsDrawer({
  persona,
  actions,
  loading,
  error,
  onApprove,
  onReject,
  onRefresh,
  onClose
}: {
  persona: AiPersona | null;
  actions: AiEmployeeAction[];
  loading: boolean;
  error: string | null;
  onApprove: (id: string) => Promise<AiEmployeeAction | void>;
  onReject: (id: string) => Promise<AiEmployeeAction | void>;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="pointer-events-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">AI workspace</p>
            <h3 className="text-lg font-semibold text-slate-900">Tools & approvals</h3>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5 text-sm">
          <ToolsList persona={persona} />
          <ApprovalsList
            actions={actions}
            loading={loading}
            error={error}
            onApprove={onApprove}
            onReject={onReject}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </div>
  );
}

function ToolsList({ persona }: { persona: AiPersona | null }) {
  const allowed = persona?.template.allowedTools ?? [];
  const keys = Array.from(new Set([...Object.keys(TOOL_CATALOG), ...allowed]));

  return (
    <section>
      <header className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
          Tools this persona can use
        </p>
        <p className="text-xs text-slate-500">Each tool is scoped to this tenant’s CRM data.</p>
      </header>
      {persona ? (
        <div className="space-y-2">
          {keys.map((key) => {
            const meta = TOOL_CATALOG[key] ?? {
              label: key,
              description: 'Custom automation'
            };
            const enabled = allowed.includes(key) && !meta.comingSoon;
            return (
              <div
                key={key}
                className={cn(
                  'rounded-2xl border px-3 py-2',
                  enabled
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600'
                )}
              >
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{meta.label}</span>
                  <CheckCircle2
                    className={cn(
                      'h-4 w-4',
                      enabled ? 'text-emerald-500' : 'text-slate-300'
                    )}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {meta.description}
                  {meta.comingSoon && ' · coming soon'}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Select a persona to view its toolset.</p>
      )}
    </section>
  );
}

function ApprovalsList({
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
    <section>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Approvals
          </p>
          <p className="text-xs text-slate-500">
            Review pending AI actions before they execute.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </header>
      {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}
      {actions.length === 0 ? (
        <p className="text-xs text-slate-500">No pending AI actions.</p>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </section>
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
  const [expanded, setExpanded] = useState(false);
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
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{action.actionType}</p>
          <p className="text-xs text-slate-500">
            Session {action.sessionId ? action.sessionId.slice(0, 6) : 'N/A'}
          </p>
        </div>
        <ActionStatusBadge status={action.status} />
      </div>

      {expanded && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-slate-950/5 p-2 text-[11px] text-slate-600">
          {JSON.stringify(action.payload, null, 2)}
        </pre>
      )}

      {action.errorMessage && (
        <p className="mt-2 text-[11px] text-red-600">{action.errorMessage}</p>
      )}
      {action.executedAt && (
        <p className="mt-2 text-[11px] text-slate-500">
          Executed {new Date(action.executedAt).toLocaleString()}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          className="text-blue-600 hover:text-blue-500"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Hide payload' : 'View payload'}
        </button>
        {actionable && (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="rounded-full bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60"
              onClick={() => run('approve')}
              disabled={pending !== null}
            >
              {pending === 'approve' ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : 'Approve'}
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 disabled:opacity-60"
              onClick={() => run('reject')}
              disabled={pending !== null}
            >
              {pending === 'reject' ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : 'Reject'}
            </button>
          </div>
        )}
      </div>
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

function PromptDebug({ persona }: { persona: AiPersona }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-[11px] text-slate-100">
      <div className="mb-2 font-semibold uppercase tracking-wide text-slate-400">
        System prompt ({persona.template.key})
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap leading-relaxed">
        {persona.template.systemPrompt}
      </pre>
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading AI employees…
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-slate-500">
      <p>Connect AI employees to this workspace to start chatting in real time.</p>
    </div>
  );
}


function getContextLabel(context?: CopilotContext) {
  if (!context) return null;
  if (context.entityType && context.entityId) {
    return `${context.entityType} · ${context.entityId}`;
  }
  if (context.entityId) {
    return context.entityId;
  }
  return context.surface ? `Surface · ${context.surface}` : null;
}

function buildWorkspaceStats(usage: AiEmployeeUsageStats) {
  const draftTool = usage.toolsUsed.find((tool) => tool.toolKey.includes('email') || tool.toolKey.includes('draft'));
  return [
    { label: 'New leads today', value: formatNumber(usage.totalActions) },
    { label: 'Overdue follow-ups', value: formatNumber(usage.failedActions) },
    { label: 'Draft emails pending', value: formatNumber(draftTool?.count ?? 0) }
  ];
}

function formatNumber(value: number | undefined) {
  if (value === undefined) return '—';
  if (value > 999) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toLocaleString();
}

function buildStubPersona(config: PersonaConfig): AiPersona {
  const template: AiEmployeeTemplate = {
    id: `stub-${config.id}`,
    key: config.id,
    displayName: config.name,
    description: config.specialty,
    systemPrompt: '',
    defaultSettings: {},
    allowedTools: []
  };
  return {
    template,
    instance: undefined
  };
}
