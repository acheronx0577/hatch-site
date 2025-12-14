import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles, Plus } from 'lucide-react';

import PipelineBoard from '@/components/crm/PipelineBoard';
import { ClientInsightsHub } from '@/components/crm/ClientInsightsHub';
import { Button } from '@/components/ui/button';
import { AgentCopilotModal, type AgentCopilotMessage } from '@/components/copilot/AgentCopilotModal';
import { PersonaProfiles } from '@/components/ai/PersonaProfiles';
import AddLeadModal from '@/components/AddLeadModal';
import { emitCopilotContext, type CopilotContext } from '@/lib/copilot/events';
import {
  chatAiPersona,
  getLeads,
  getPipelines,
  createLead,
  createLeadNote,
  type LeadSummary,
  type Pipeline,
  type PersonaChatMessage,
  type CreateLeadPayload
} from '@/lib/api/hatch';
import { createMessageId } from '@/lib/ai/message';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { PersonaId } from '@/lib/ai/aiPersonas';
import { trackEvent } from '@/lib/analytics';
import { buildMemoryToastPayload } from '@/lib/ai/memoryToast';
import { resolveUserIdentity } from '@/lib/utils';

const DEFAULT_LIMIT = 100;
const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch';

type HeroNavItem = {
  label: string;
  href?: string;
  tabValue?: 'pipeline' | 'insights' | 'ai_team';
  onSelect?: () => void;
};

export default function BrokerCRMPage() {
  const { toast } = useToast();
  const { session, user } = useAuth();
  const senderName = useMemo(() => {
    const { displayName } = resolveUserIdentity(session?.profile ?? {}, user?.email ?? undefined, 'Your Account');
    return displayName || undefined;
  }, [session?.profile, user?.email]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroTab, setHeroTab] = useState<'pipeline' | 'insights' | 'ai_team'>('pipeline');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPersonaId, setCopilotPersonaId] = useState<PersonaId>('agent_copilot');
  const [copilotMessages, setCopilotMessages] = useState<AgentCopilotMessage[]>([]);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const copilotMessagesRef = useRef<AgentCopilotMessage[]>([]);

  useEffect(() => {
    copilotMessagesRef.current = copilotMessages;
  }, [copilotMessages]);

  const openCopilot = useCallback((personaId?: PersonaId) => {
    if (personaId) {
      setCopilotPersonaId(personaId);
    }
    setCopilotOpen(true);
  }, []);

  const handleHeroTabChange = useCallback(
    (nextTab: 'pipeline' | 'insights' | 'ai_team') => {
      if (nextTab === heroTab) return;
      void trackEvent({
        name: 'crm.hero_tab.change',
        category: 'crm',
        tenantId: TENANT_ID,
        properties: {
          previousTab: heroTab,
          nextTab,
          leadCount: leads.length,
          pipelineId: pipelines[0]?.id ?? null
        }
      });
      setHeroTab(nextTab);
    },
    [heroTab, leads.length, pipelines]
  );

  const handleOpenCopilot = useCallback(
    (source: 'crm_hero' | 'hero_nav' = 'crm_hero') => {
      void trackEvent({
        name: 'copilot.opened',
        category: 'copilot',
        tenantId: TENANT_ID,
        properties: {
          source,
          personaId: copilotPersonaId,
          heroTab,
          leadCount: leads.length,
          pipelineId: pipelines[0]?.id ?? null
        }
      });
      openCopilot();
    },
    [copilotPersonaId, heroTab, leads.length, openCopilot, pipelines]
  );

  const handleStartPersonaChat = useCallback(
    (personaId: PersonaId) => {
      void trackEvent({
        name: 'copilot.persona_profile.start_chat',
        category: 'copilot',
        tenantId: TENANT_ID,
        properties: {
          personaId,
          source: 'persona_profiles',
          heroTab,
          leadCount: leads.length,
          pipelineId: pipelines[0]?.id ?? null
        }
      });
      openCopilot(personaId);
    },
    [heroTab, leads.length, openCopilot, pipelines]
  );

  const handleSendCopilotMessage = useCallback(
    async (text: string, personaId: PersonaId) => {
      const userMessage: AgentCopilotMessage = { id: createMessageId(), role: 'user', content: text };
      const history = [...copilotMessagesRef.current, userMessage];
      setCopilotMessages(history);
      void trackEvent({
        name: 'copilot.message.send',
        category: 'copilot',
        tenantId: TENANT_ID,
        properties: {
          personaId,
          heroTab,
          leadCount: leads.length,
          pipelineId: pipelines[0]?.id ?? null,
          historyLength: history.length,
          messageLength: text.length,
          source: 'crm_page'
        }
      });
      try {
        const response = await chatAiPersona({
          text,
          currentPersonaId: personaId,
          history: history.map<PersonaChatMessage>(({ role, content, personaId: msgPersonaId }) => ({
            role,
            content,
            personaId: msgPersonaId
          }))
        });
        setCopilotPersonaId(response.activePersonaId);
        if (response.messages?.length) {
          const assistant = response.messages.map<AgentCopilotMessage>((message) => ({
            id: createMessageId(),
            role: message.role,
            content: message.content,
            personaId: message.personaId
          }));
          setCopilotMessages((prev) => [...prev, ...assistant]);
        }
        const memoryToast = buildMemoryToastPayload(response.memoryLog);
        if (memoryToast) {
          toast(memoryToast);
        }
        void trackEvent({
          name: 'copilot.message.responded',
          category: 'copilot',
          tenantId: TENANT_ID,
          properties: {
            personaId: response.activePersonaId,
            heroTab,
            leadCount: leads.length,
            pipelineId: pipelines[0]?.id ?? null,
            historyLength: history.length,
            responseCount: response.messages?.length ?? 0,
            source: 'crm_page'
          }
        });
      } catch (error) {
        console.error('Copilot chat failed', error);
        toast({
          variant: 'destructive',
          title: 'Copilot unavailable',
          description: error instanceof Error ? error.message : 'Unable to reach Agent Copilot right now.'
        });
        void trackEvent({
          name: 'copilot.message.error',
          category: 'copilot',
          tenantId: TENANT_ID,
          properties: {
            personaId,
            heroTab,
            leadCount: leads.length,
            pipelineId: pipelines[0]?.id ?? null,
            historyLength: history.length,
            source: 'crm_page',
            error: error instanceof Error ? error.message : 'unknown'
          }
        });
      }
    },
    [heroTab, leads.length, pipelines, toast]
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [pipelineData, leadResponse] = await Promise.all([
        getPipelines(),
        getLeads({ limit: DEFAULT_LIMIT })
      ]);
      setPipelines(pipelineData);
      setLeads(leadResponse.items);
    } catch (error) {
      console.error('Failed to load CRM data', error);
      toast({
        title: 'Failed to load pipeline',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleQuickMetricsRefresh = useCallback(() => {
    void trackEvent({
      name: 'crm.quick_metrics.refresh',
      category: 'crm',
      tenantId: TENANT_ID,
      properties: {
        heroTab,
        leadCount: leads.length,
        pipelineId: pipelines[0]?.id ?? null
      }
    });
    void fetchData();
  }, [fetchData, heroTab, leads.length, pipelines]);

  const handlePipelineBoardRefresh = useCallback(() => {
    void trackEvent({
      name: 'crm.pipeline_board.refresh',
      category: 'crm',
      tenantId: TENANT_ID,
      properties: {
        heroTab,
        leadCount: leads.length,
        pipelineId: pipelines[0]?.id ?? null
      }
    });
    return fetchData();
  }, [fetchData, heroTab, leads.length, pipelines]);

  const primaryPipeline = pipelines[0] ?? null;
  const stageCount = primaryPipeline?.stages?.length ?? 0;
  const activeLeads = leads.length;
  const avgStageHours =
    leads.length > 0
      ? Math.round(
          leads.reduce((sum, lead) => {
            const entered = lead.stageEnteredAt ? new Date(lead.stageEnteredAt) : new Date(lead.createdAt);
            return sum + (Date.now() - entered.getTime()) / 3_600_000;
          }, 0) / leads.length
        )
      : 0;

  const conversionRate =
    leads.length > 0
      ? `${Math.round((leads.filter((lead) => lead.stageId === 'QUALIFIED' || lead.stageId === 'CLOSED').length / leads.length) * 100)}%`
      : '0%';

  const heroNavItems = useMemo<HeroNavItem[]>(
    () => [
      { label: 'Pipeline', tabValue: 'pipeline', onSelect: () => handleHeroTabChange('pipeline') },
      { label: 'Client Insights', tabValue: 'insights', onSelect: () => handleHeroTabChange('insights') },
      { label: 'AI Team', tabValue: 'ai_team', onSelect: () => handleHeroTabChange('ai_team') },
      { label: 'Pipeline Designer', href: '/broker/lead-routing' }
    ],
    [handleHeroTabChange]
  );

  const touchCount = useMemo(
    () => leads.reduce((sum, lead) => sum + (lead.activityRollup?.lastTouchpointAt ? 1 : 0), 0),
    [leads]
  );

  const dormantCount = useMemo(() => leads.filter((lead) => isLeadIdle(lead)).length, [leads]);
  const ownerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    leads.forEach((lead) => {
      if (lead.owner) {
        map.set(lead.owner.id, { id: lead.owner.id, name: lead.owner.name });
      }
    });
    return Array.from(map.values());
  }, [leads]);

  const quickCards = useMemo(() => {
    return [
      { label: 'Active Leads', value: activeLeads.toString(), caption: stageCount ? `${stageCount} stages` : 'No stage timing yet' },
      { label: 'Avg Time In Stage', value: avgStageHours ? `${avgStageHours} h` : '—', caption: 'Team velocity' },
      { label: 'Need Attention', value: dormantCount.toString(), caption: dormantCount ? 'Pipeline idle' : 'All leads touched' },
      { label: 'Touches Logged', value: touchCount.toString(), caption: 'Last 48h' }
    ];
  }, [activeLeads, avgStageHours, dormantCount, stageCount, touchCount]);

  const stageSummary = useMemo(() => {
    if (!primaryPipeline) return [] as Array<{ name: string; leadCount: number }>;
    const counts = new Map<string, number>();
    leads.forEach((lead) => {
      const stageId = lead.stage?.id ?? lead.stageId;
      if (!stageId) return;
      counts.set(stageId, (counts.get(stageId) ?? 0) + 1);
    });
    return primaryPipeline.stages.map((stage) => ({
      name: stage.name,
      leadCount: counts.get(stage.id) ?? 0
    }));
  }, [primaryPipeline, leads]);

  const heroMetrics = useMemo(
    () => [
      { label: 'Active leads', value: activeLeads.toString() },
      { label: 'Avg time in stage', value: avgStageHours ? `${avgStageHours} h` : '—' },
      { label: 'Conversion rate', value: conversionRate }
    ],
    [activeLeads, avgStageHours, conversionRate]
  );

  const copilotContext = useMemo<CopilotContext>(
    () => ({
      surface: 'dashboard',
      summary: `${primaryPipeline?.name ?? 'Pipeline'} · ${leads.length} leads`,
      metadata: {
        tenantId: TENANT_ID,
        page: 'crm',
        analytics: heroMetrics,
        snapshot: quickCards,
        pipeline: {
          name: primaryPipeline?.name ?? 'Pipeline',
          stageCount,
          totalLeads: leads.length,
          idleLeads: dormantCount,
          stageSummary
        }
      }
    }),
    [dormantCount, heroMetrics, leads.length, primaryPipeline?.name, quickCards, stageCount, stageSummary]
  );

  useEffect(() => {
    emitCopilotContext(copilotContext);
  }, [copilotContext]);

  if (loading && pipelines.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading pipeline…
      </div>
    );
  }

  return (
    <>
      <div className="max-w-full space-y-8">
        <PipelineHero
          pipelineName={primaryPipeline?.name ?? 'Pipeline'}
          stageCount={stageCount}
          metrics={heroMetrics}
          navItems={heroNavItems}
          onOpenCopilot={handleOpenCopilot}
          activeTab={heroTab}
          onAddLead={() => setAddLeadOpen(true)}
        />

        {heroTab === 'pipeline' && (
          <div className="space-y-8">
            <QuickMetrics cards={quickCards} onRefresh={handleQuickMetricsRefresh} />
            {pipelines.length > 0 ? (
              <section id="pipeline" className="max-w-full overflow-hidden">
                <PipelineBoard
                  pipelines={pipelines}
                  initialLeads={leads}
                  onRefresh={handlePipelineBoardRefresh}
                  showHero={false}
                  onRequestAddLead={() => setAddLeadOpen(true)}
                />
              </section>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
                No pipelines found for this tenant. Configure buyer/seller pipelines in the admin console to begin managing leads.
              </div>
            )}
          </div>
        )}

        {heroTab === 'insights' && (
          <section id="client-insights">
            <ClientInsightsHub tenantId={TENANT_ID} />
          </section>
        )}

        {heroTab === 'ai_team' && (
          <section id="ai-team">
            <PersonaProfiles onStartChat={handleStartPersonaChat} />
          </section>
        )}
      </div>

      <AgentCopilotModal
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        activePersonaId={copilotPersonaId}
        setActivePersonaId={setCopilotPersonaId}
        messages={copilotMessages}
        onSendMessage={handleSendCopilotMessage}
        onAppendMessages={(next) => setCopilotMessages((prev) => [...prev, ...next])}
        senderName={senderName}
      />
      <AddLeadModal
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        pipelines={pipelines}
        owners={ownerOptions}
        defaultPipelineId={pipelines[0]?.id}
        onCreate={async (payload) => {
          const { notes, ...rest } = payload;
          const lead = await createLead(rest);
          if (notes?.trim()) {
            await createLeadNote(lead.id, notes.trim());
          }
          const fallbackName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
          const description = fallbackName || lead.email || 'Lead added to pipeline.';
          toast({
            title: 'Lead added',
            description
          });
          await fetchData();
        }}
      />
    </>
  );
}

type PipelineHeroProps = {
  pipelineName: string;
  stageCount: number;
  metrics: Array<{ label: string; value: string }>;
  navItems: HeroNavItem[];
  onOpenCopilot: () => void;
  activeTab: 'pipeline' | 'insights' | 'ai_team';
  onAddLead: () => void;
};

function PipelineHero({ pipelineName, stageCount, metrics, navItems, onOpenCopilot, activeTab, onAddLead }: PipelineHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-r from-[#1F5FFF] via-[#3D86FF] to-[#00C6A2] text-white shadow-[0_30px_80px_rgba(31,95,255,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_52%)]" />
      <div className="relative flex flex-col gap-6 px-6 py-8 md:px-10 md:py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-white/80">Customer Relationship Hub</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Manage pipeline health with real-time context.</h1>
            <p className="mt-2 text-sm text-white/85">Track velocity, surface engagement signals, and let Copilot draft your next outreach.</p>
          </div>
          <p className="text-sm text-white/70">
            Active pipeline: <span className="font-medium text-white">{pipelineName}</span> · {stageCount} stages
          </p>
        </div>
        <div className="grid w-full gap-4 rounded-2xl border border-white/20 bg-white/20 p-5 backdrop-blur sm:grid-cols-3 lg:max-w-xl">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl bg-white/25 px-4 py-3 text-start shadow-inner shadow-white/20">
              <p className="text-xs uppercase tracking-wide text-white/80">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 bg-white/5 px-6 py-3 text-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const baseClass = 'rounded-full px-3 py-1 text-xs font-semibold transition';
              const activeClass = 'border-white bg-white/20 text-white shadow-sm';
              const inactiveClass = 'border border-white/30 text-white/90 hover:border-white hover:bg-white/10';

              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={`${baseClass} ${inactiveClass}`}
                  >
                    {item.label}
                  </Link>
                );
              }

              const isActive = item.tabValue ? item.tabValue === activeTab : false;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.onSelect?.()}
                  className={`${baseClass} ${isActive ? activeClass : inactiveClass}`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="bg-white text-blue-600 hover:bg-blue-50"
              onClick={onAddLead}
            >
              <Plus className="mr-2 h-4 w-4" /> Add lead
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="bg-white/90 text-blue-600 hover:bg-white"
              onClick={onOpenCopilot}
            >
              <Sparkles className="mr-2 h-4 w-4" /> Open Copilot
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickMetrics({ cards, onRefresh }: { cards: Array<{ label: string; value: string; caption?: string }>; onRefresh: () => void }) {
  return (
    <div className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Pipeline Snapshot</p>
          <h2 className="text-xl font-semibold text-slate-900">Today at a glance</h2>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
            {card.caption && <p className="text-xs text-slate-500">{card.caption}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function isLeadIdle(lead: LeadSummary) {
  if (!lead.lastActivityAt) return true;
  const days = (Date.now() - new Date(lead.lastActivityAt).getTime()) / 86_400_000;
  return days > 3;
}
