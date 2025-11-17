"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { chatAiEmployee, type AiEmployeeAction } from '@/lib/api/hatch';
import type { AiPersona } from '@/hooks/useAiEmployees';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PERSONAS, getPersonaConfigById, type PersonaConfig, type PersonaId } from '@/lib/ai/aiPersonas';
import { cn } from '@/lib/utils';
import { CopilotSendEmailDialog } from '@/components/copilot/CopilotSendEmailDialog';
import { extractEmailDraft } from '@/lib/ai/emailDraft';
import type { CopilotContext } from '@/lib/copilot/events';
import { wantsAiToSendEmail } from '@/lib/ai/sendIntent';
import { createMessageId } from '@/lib/ai/message';
import { lookupContactEmail, lookupContactEmailsFromString } from '@/lib/ai/contactLookup';
import { extractRecipientQuery } from '@/lib/ai/recipient';

type CopilotMessage =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; actions?: AiEmployeeAction[] };

type CopilotPanelProps = {
  persona: AiPersona;
  personaConfig?: PersonaConfig;
  context?: CopilotContext;
  className?: string;
  senderName?: string;
};

export function CopilotPanel({ persona, personaConfig, context, className, senderName }: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState({ subject: '', body: '' });
  const [pendingSendIntent, setPendingSendIntent] = useState(false);
  const [pendingRecipientQuery, setPendingRecipientQuery] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<{ subject: string; body: string } | null>(null);
  const [dialogRecipients, setDialogRecipients] = useState<string[]>([]);
  const [autoOpenedFromDraft, setAutoOpenedFromDraft] = useState(false);
  const details = personaConfig ?? getPersonaConfigForPersona(persona);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setInput('');
  }, [persona.template.id, persona.instance?.id]);

  const instance = persona.instance;

  const { channel, contextType, contextId, contextRecipient } = useMemo(() => {
    const record = context as unknown as Record<string, unknown> | undefined;
    const getString = (key: string) => {
      if (!record) return undefined;
      const value = record[key];
      return typeof value === 'string' ? value : undefined;
    };
    const metadata = (context?.metadata ?? {}) as Record<string, unknown>;
    const candidateKeys = ['email', 'primaryEmail', 'contactEmail', 'personEmail', 'leadEmail'];
    const values = candidateKeys
      .map((key) => record?.[key])
      .concat(candidateKeys.map((key) => metadata[key]));
    const recipient = values.find((value): value is string => typeof value === 'string' && value.includes('@'));
    return {
      channel: getString('channel') ?? 'web_chat',
      contextType: getString('contextType') ?? getString('page'),
      contextId: getString('contextId') ?? getString('entityId'),
      contextRecipient: recipient
    };
  }, [context]);

  const openComposer = (draft: { subject: string; body: string }, recipientQuery?: string | null) => {
    setEmailDefaults(draft);
    setEmailDialogOpen(true);
    if (contextRecipient) {
      setDialogRecipients([contextRecipient]);
      return;
    }
    setDialogRecipients([]);
    if (recipientQuery) {
      void (async () => {
        const list = await lookupContactEmailsFromString(recipientQuery);
        if (list.length > 0) {
          setDialogRecipients(Array.from(new Set(list)));
        } else {
          const resolved = await lookupContactEmail(recipientQuery);
          if (resolved?.email) {
            setDialogRecipients([resolved.email]);
          }
        }
      })();
    }
  };

  const send = async () => {
    if (!instance) return;
    const text = input.trim();
    if (!text || sending) return;

    const wantsSend = wantsAiToSendEmail(text);
    if (wantsSend) {
      const draft =
        lastDraft ?? (lastAssistantMessage ? extractEmailDraft(lastAssistantMessage.content) : null);
      if (draft) {
        setInput('');
        setError(null);
        const userMessage: CopilotMessage = { id: createMessageId(), role: 'user', content: text };
        const assistantMessage: CopilotMessage = {
          id: createMessageId(),
          role: 'assistant',
          content: 'Opening the email composer so you can send this now.'
        };
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
        openComposer(draft, text);
        setPendingSendIntent(false);
        return;
      }
      // No draft yet — ask AI to draft, and auto-open once the assistant responds with a Subject line
      setPendingSendIntent(true);
      setPendingRecipientQuery(text);
      // Continue to send prompt so the AI generates a proper draft; the composer will open when ready
    }

    setInput('');
    setError(null);
    const userMessage: CopilotMessage = { id: createMessageId(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);

    try {
      const response = await chatAiEmployee(instance.id, {
        message: text,
        channel,
        contextType,
        contextId
      });
      const assistantMessage: CopilotMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: response.reply,
        actions: response.actions
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to contact AI employee.';
      setMessages((prev) => [
        ...prev,
        { id: createMessageId(), role: 'assistant', content: `Error: ${message}` }
      ]);
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const setSuggestion = (suggestion: string) => {
    setInput(suggestion);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(suggestion.length, suggestion.length);
    });
  };

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant') ?? null,
    [messages]
  );

  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      if (!message.content?.toLowerCase().includes('subject')) continue;
      setLastDraft(extractEmailDraft(message.content));
      return;
    }
  }, [messages]);

  useEffect(() => {
    if (!pendingSendIntent || !lastDraft) return;
    openComposer(lastDraft, pendingRecipientQuery);
    setPendingSendIntent(false);
    setPendingRecipientQuery(null);
  }, [pendingRecipientQuery, pendingSendIntent, lastDraft]);

  useEffect(() => {
    if (contextRecipient) {
      setDialogRecipients([contextRecipient]);
    }
  }, [contextRecipient]);

  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'user') ?? null,
    [messages]
  );

  // If the assistant produced an email-style draft (contains a Subject: line), auto-open the composer once.
  useEffect(() => {
    if (emailDialogOpen || autoOpenedFromDraft) return;
    const assistant = lastAssistantMessage;
    if (!assistant || !assistant.content) return;
    const content = assistant.content;
    if (/\bsubject\s*:/i.test(content)) {
      const draft = extractEmailDraft(content);
      const userQuery = pendingSendIntent
        ? pendingRecipientQuery
        : lastUserMessage
          ? lastUserMessage.content
          : null;
      openComposer(draft, userQuery ?? undefined);
      setAutoOpenedFromDraft(true);
    }
  }, [emailDialogOpen, autoOpenedFromDraft, lastAssistantMessage, lastUserMessage]);

  const handleOpenEmailDialog = () => {
    const draft = lastDraft ?? (lastAssistantMessage ? extractEmailDraft(lastAssistantMessage.content) : null);
    if (!draft) return;
    const userQuery = lastUserMessage ? lastUserMessage.content : null;
    openComposer(draft, userQuery);
  };

  return (
    <>
      <div className={cn('flex h-full flex-col rounded-2xl border bg-background shadow-xl', className)}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{details.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {details.tagline} · {details.specialty}
          </div>
        </div>
        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {channel}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-muted/40 p-4 text-sm text-muted-foreground">
            Ask {details.shortName} to summarize leads, draft outreach, or prep your next call. Your chat stays scoped to this tenant.
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {instance ? (
        <div className="border-t px-4 py-3">
          <SuggestionRow suggestions={details.examples} persona={details} onSelect={setSuggestion} />
          <div className="mt-2 flex flex-col gap-3">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={details.placeholder}
              className="min-h-[44px] resize-none rounded-2xl border px-3 py-2 text-sm"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!input.trim()) return;
                  void send();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">Ask {details.shortName}:</p>
              <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                {details.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="rounded-full border px-2 py-0.5"
                    onClick={() => setSuggestion(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button disabled={!input.trim() || sending} onClick={() => void send()}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send
              </Button>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Need the latest response as an email?</span>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={!lastDraft && !lastAssistantMessage}
                  onClick={handleOpenEmailDialog}
                >
                  Send with AI
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span>{details.shortName} is provisioning for this tenant. You’ll be able to chat in a moment.</span>
          </div>
        </div>
      )}
      </div>

      <CopilotSendEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        defaultPersonaId={(personaConfig?.id as PersonaId) ?? (persona.template.key as PersonaId)}
        defaultSubject={emailDefaults.subject}
        defaultBody={emailDefaults.body}
        defaultRecipients={dialogRecipients.length ? dialogRecipients : contextRecipient ? [contextRecipient] : undefined}
        defaultSenderName={senderName}
      />
    </>
  );
}

function SuggestionRow({
  suggestions,
  persona,
  onSelect
}: {
  suggestions: string[];
  persona: PersonaConfig;
  onSelect: (value: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-semibold uppercase tracking-wide text-slate-400">Try asking {persona.shortName}:</span>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="rounded-full border border-dashed px-3 py-1 text-[11px] font-medium hover:border-blue-400 hover:text-blue-600"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: CopilotMessage }) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
          message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'
        }`}
      >
        <p>{message.content}</p>
        {message.role === 'assistant' && message.actions && message.actions.length > 0 && (
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            {message.actions.map((action) => {
              const status = (action.status ?? '').toLowerCase();
              const waitingApproval =
                action.requiresApproval && (status === 'proposed' || status === 'requires-approval');
              return (
                <div
                  key={action.id}
                  className="rounded-xl border border-slate-200 bg-white/70 p-2 text-left"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
                    <span className="text-slate-700">{action.actionType}</span>
                    <InlineStatus status={action.status} />
                  </div>
                  {status === 'executed' && (
                    <p className="text-[11px] text-emerald-600">Completed successfully.</p>
                  )}
                  {status === 'failed' && action.errorMessage && (
                    <p className="text-[11px] text-red-600">{action.errorMessage}</p>
                  )}
                  {waitingApproval && (
                    <p className="text-[11px] text-amber-600">Requires approval before executing.</p>
                  )}
                  {action.payload && (
                    <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-slate-950/5 p-2 text-[11px] text-slate-500">
                      {JSON.stringify(action.payload, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineStatus({ status }: { status: string }) {
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
    proposed: { label: 'Proposed', className: 'bg-slate-200 text-slate-700 border-slate-300' }
  };
  const variant = variants[normalized] ?? {
    label: status,
    className: 'bg-slate-200 text-slate-700 border-slate-300'
  };
  return (
    <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${variant.className}`}>
      {variant.label}
    </span>
  );
}

function getPersonaConfigForPersona(persona: AiPersona): PersonaConfig {
  return (
    getPersonaConfigById(persona.template.key) ?? {
      id: persona.template.key as PersonaConfig['id'],
      name: persona.template.displayName,
      shortName: persona.template.displayName,
      color: '#1F2937',
      accentColor: '#E5E7EB',
      avatarBg: 'rgba(15,23,42,0.08)',
      avatarEmoji: '✨',
      icon: 'sparkles',
      tagline: persona.template.description ?? 'AI assistant',
      placeholder: `Ask ${persona.template.displayName} for help…`,
      examples: PERSONAS[0]?.examples ?? ['Summarize my new leads', 'Draft an email'],
      specialty: persona.template.description ?? 'AI assistant'
    }
  );
}
