"use client";

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { chatAiEmployee, type AiEmployeeAction } from '@/lib/api/ai-employees';
import type { AiPersona } from '@/hooks/use-ai-employees';
import type { PersonaContext } from '@/lib/personas/events';

type PersonaMessage =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; actions?: AiEmployeeAction[] };

type PersonaChatPanelProps = {
  persona: AiPersona;
  context?: PersonaContext | Record<string, unknown>;
  onActionsCreated?: () => void;
};

type QuickPrompt = { label: string; text: string };

const formatActionName = (actionType?: string) => {
  if (!actionType) return 'Action';
  const normalized = actionType.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Action';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const summarizeActionPayload = (payload: Record<string, unknown> | null | undefined): string | null => {
  if (!isPlainObject(payload)) return null;

  const tasks = isPlainObject(payload.tasks) ? payload.tasks : null;
  const totals = isPlainObject(payload.totals) ? payload.totals : null;
  const parts: string[] = [];

  if (totals) {
    const newLeads = toNumber(totals.newLeads);
    const activeLeads = toNumber(totals.activeLeads);
    const idleLeads = toNumber(totals.idleLeads);
    const leadBits = [
      typeof newLeads === 'number' ? `${newLeads} new` : null,
      typeof activeLeads === 'number' ? `${activeLeads} active` : null,
      typeof idleLeads === 'number' ? `${idleLeads} idle` : null
    ].filter(Boolean);
    if (leadBits.length) {
      parts.push(`Leads: ${leadBits.join(', ')}`);
    }
  }

  if (tasks) {
    const open = toNumber(tasks.open);
    const dueSoon = toNumber(tasks.dueSoon);
    const taskBits = [
      typeof open === 'number' ? `${open} open` : null,
      typeof dueSoon === 'number' ? `${dueSoon} due soon` : null
    ].filter(Boolean);
    if (taskBits.length) {
      parts.push(`Tasks: ${taskBits.join(', ')}`);
    }
  }

  if (parts.length) return parts.join(' · ');

  const primitivePairs = Object.entries(payload).filter(
    ([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
  if (primitivePairs.length) {
    return primitivePairs
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(', ');
  }

  return null;
};

const summarizeAction = (action: AiEmployeeAction): string => {
  const name = formatActionName(action.actionType);
  const rawStatus = (action.status ?? '').toLowerCase();
  const displayStatus = rawStatus.replace(/[_-]+/g, ' ');
  const needsApproval =
    action.requiresApproval && (rawStatus === 'proposed' || rawStatus === 'requires-approval');
  const statusText = needsApproval ? 'awaiting approval' : displayStatus;
  const payloadSummary = summarizeActionPayload(action.payload);

  const segments = [statusText ? `${name} (${statusText})` : name];
  if (payloadSummary) segments.push(payloadSummary);
  if (action.errorMessage) segments.push(`Error: ${action.errorMessage}`);

  return segments.join('. ').trim();
};

export function PersonaChatPanel({ persona, context, onActionsCreated }: PersonaChatPanelProps) {
  const [messages, setMessages] = useState<PersonaMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setError(null);
  }, [persona.template.id, persona.instance?.id]);

  const instance = persona.instance;

  const { channel, contextType, contextId, entitySummary } = useMemo(() => {
    const getString = (key: string) => {
      if (!context) return undefined;
      const value = (context as Record<string, unknown>)[key];
      return typeof value === 'string' ? value : undefined;
    };
    const derivedContextType = getString('contextType') ?? getString('page');
    const entityType = getString('entityType');
    const surface = getString('surface');
    const summary = getString('summary');

    const resolvedContextType = entityType ?? derivedContextType ?? surface;

    return {
      channel: getString('channel') ?? 'web_chat',
      contextType: resolvedContextType,
      contextId: getString('contextId') ?? getString('entityId'),
      entitySummary: summary
    };
  }, [context]);

  const quickPrompts: QuickPrompt[] = useMemo(() => {
    const prompts: QuickPrompt[] = [
      { label: 'Who should I call today?', text: 'Who should I call today?' },
      { label: 'Any overdue tasks?', text: 'Do we have any overdue tasks I should handle right now?' },
      { label: 'Hot leads', text: 'Summarize our hottest leads and owners.' }
    ];

    const entityType = typeof (context as Record<string, unknown> | undefined)?.entityType === 'string'
      ? (context as Record<string, unknown>).entityType
      : undefined;
    const entityId = typeof (context as Record<string, unknown> | undefined)?.entityId === 'string'
      ? (context as Record<string, unknown>).entityId
      : undefined;

    if (entityType === 'lead' && entityId) {
      prompts.unshift({
        label: 'Brief this lead',
        text: `Give me a quick brief on this lead (${entityId}) and the next best action.`
      });
    }

    return prompts;
  }, [context]);

  const send = async (overrideText?: string) => {
    if (!instance) return;
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;

    setInput('');
    setError(null);
    const userMessage: PersonaMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);

    try {
      const response = await chatAiEmployee(instance.id, {
        message: text,
        channel,
        contextType,
        contextId
      });
      const assistantMessage: PersonaMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.reply,
        actions: response.actions
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (response.actions?.length && onActionsCreated) {
        onActionsCreated();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to contact AI persona.';
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${message}` }
      ]);
      setError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200">
      <PanelHeader persona={persona} channel={channel} contextSummary={entitySummary} />

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <QuickPromptRow
          prompts={quickPrompts}
          onPrompt={(prompt) => void send(prompt)}
          disabled={!instance || sending}
        />
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500">
            Ask {persona.template.displayName.split('—')[0] ?? 'this persona'} to summarize leads,
            generate marketing copy, or draft follow-ups.
          </p>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>

      {error && (
        <div className="px-3 pb-1 text-xs text-red-600">
          {error}
        </div>
      )}

      <FooterInput
        persona={persona}
        disabled={!instance || sending}
        input={input}
        onInputChange={setInput}
        onSend={() => void send()}
        sending={sending}
      />
    </div>
  );
}

function PanelHeader({
  persona,
  channel,
  contextSummary
}: {
  persona: AiPersona;
  channel: string;
  contextSummary?: string;
}) {
  if (!persona.instance) {
    return (
      <div className="border-b px-4 py-3 text-xs text-slate-500">
        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
          {persona.template.key}
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-900">
          {persona.template.displayName}
        </p>
        <p className="text-[11px] text-amber-600">
          This persona isn’t enabled for this tenant yet.
        </p>
      </div>
    );
  }

  const instance = persona.instance;

  return (
    <div className="border-b px-4 py-3 text-xs">
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
        {persona.template.key}
      </p>
      <div className="flex items-center justify-between text-slate-600">
        <div>
          <p className="text-sm font-semibold text-slate-900">{persona.template.displayName}</p>
          <p className="text-[11px] text-slate-500">
            Mode: {instance.autoMode} · Assigned to {instance.userId ? 'you' : 'workspace'}
          </p>
          {contextSummary && (
            <p className="text-[11px] text-slate-500">
              Using context: {contextSummary}
            </p>
          )}
        </div>
        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
          {channel}
        </span>
      </div>
    </div>
  );
}

function FooterInput(props: {
  persona: AiPersona;
  disabled: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const { persona, disabled, input, onInputChange, onSend, sending } = props;
  const placeholder = persona.instance
    ? `Chat with ${persona.template.displayName}…`
    : `${persona.template.displayName} is disabled for this tenant.`;

  return (
    <div className="flex gap-2 border-t p-2">
      <input
        className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
        placeholder={placeholder}
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSend();
          }
        }}
        disabled={disabled}
      />
      <button
        type="button"
        className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        onClick={onSend}
        disabled={disabled || !input.trim()}
      >
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Send
      </button>
    </div>
  );
}

function QuickPromptRow({
  prompts,
  onPrompt,
  disabled
}: {
  prompts: QuickPrompt[];
  onPrompt: (text: string) => void;
  disabled: boolean;
}) {
  if (!prompts.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {prompts.map((prompt) => (
        <button
          key={prompt.label}
          type="button"
          onClick={() => onPrompt(prompt.text)}
          disabled={disabled}
          className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: PersonaMessage }) {
  const isUser = message.role === 'user';
  const actionSummaries =
    message.role === 'assistant' && message.actions
      ? message.actions.map((action) => ({ id: action.id, summary: summarizeAction(action) }))
      : [];

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
          isUser ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {actionSummaries.length > 0 && (
          <div className="mt-2 space-y-1 text-[12px] leading-relaxed text-slate-700">
            {actionSummaries.map(({ id, summary }) => (
              <p key={id} className="flex items-start gap-2">
                <span aria-hidden="true">•</span>
                <span>{summary}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
