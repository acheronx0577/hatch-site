"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Copy, Loader2, MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { chatAiEmployee, createLeadTask, type AiEmployeeAction } from '@/lib/api/hatch';
import type { AiPersona } from '@/hooks/useAiEmployees';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  PERSONA_COLORS,
  PERSONAS,
  getPersonaConfigById,
  type PersonaConfig,
  type PersonaId
} from '@/lib/ai/aiPersonas';
import { AiPersonaFace } from '@/components/ai/AiPersonaFace';
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
  | { id: string; role: 'assistant'; content: string; personaId?: PersonaId };

type CopilotPanelProps = {
  persona: AiPersona;
  personaConfig?: PersonaConfig;
  allPersonas?: AiPersona[];
  context?: CopilotContext;
  className?: string;
  senderName?: string;
  chatMode?: 'team' | 'direct';
  prefill?: string | null;
  onPrefillConsumed?: () => void;
};

const DIRECT_PERSONA_MAP: Record<string, PersonaId> = {
  hatch: 'hatch_assistant',
  echo: 'agent_copilot',
  lumen: 'lead_nurse',
  haven: 'listing_concierge',
  atlas: 'market_analyst',
  nova: 'transaction_coordinator'
};

const resolveDirectPersonaPrefix = (
  input: string
): { personaId: PersonaId; remainder: string } | null => {
  const match = input.match(/^\s*@?(hatch|echo|lumen|haven|atlas|nova)\b\s*[:,\-]?\s*(.*)$/i);
  if (!match) return null;
  const rawName = match[1]?.toLowerCase();
  if (!rawName) return null;
  const personaId = DIRECT_PERSONA_MAP[rawName];
  if (!personaId) return null;
  return { personaId, remainder: (match[2] ?? '').trim() };
};

const extractLeadId = (content: string) => {
  const match = content.match(/\bleadId:\s*([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
};

const resolveDirectPersonaMessage = (
  input: string,
  activePersonaId: PersonaId,
  personas?: AiPersona[]
): { personaId: PersonaId; instanceId: string; message: string } | null => {
  if (activePersonaId !== 'hatch_assistant') return null;
  if (!personas || personas.length === 0) return null;

  const match = input.match(/^\s*@?(hatch|echo|lumen|haven|atlas|nova)\b\s*[:,\-]?\s*(.*)$/i);
  if (!match) return null;

  const rawName = match[1]?.toLowerCase();
  if (!rawName) return null;

  const personaId = DIRECT_PERSONA_MAP[rawName];
  if (!personaId) return null;

  const remainder = (match[2] ?? '').trim();
  if (!remainder) return null;

  const target = personas.find((p) => (p.template.key as PersonaId) === personaId);
  const instanceId = target?.instance?.id;
  if (!instanceId) return null;

  return { personaId, instanceId, message: remainder };
};

const prettifyAssistantContent = (content: string) => {
  let formatted = content?.trim?.() ?? '';
  if (!formatted) return '';

  // Strip fenced code blocks (often tool output / JSON dumps).
  formatted = formatted.replace(/```[\s\S]*?```/g, '');

  // Strip inline tool markers.
  formatted = formatted
    .replace(/^GET_[A-Z0-9_ -]+$/gim, '')
    .replace(/^EXECUTED$/gim, '')
    .replace(/Completed successfully\.?/gi, '');

  // Drop raw JSON objects/arrays that sometimes get echoed into the chat.
  formatted = formatted.replace(/\{[\s\S]*?\}/g, '').replace(/\[[\s\S]*?\]/g, '');

  // Collapse extra blank lines.
  formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();

  return formatted;
};

export function CopilotPanel({
  persona,
  personaConfig,
  allPersonas,
  context,
  className,
  senderName,
  chatMode = 'direct',
  prefill,
  onPrefillConsumed
}: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingPersonaId, setSendingPersonaId] = useState<PersonaId | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState({ subject: '', body: '' });
  const [pendingSendIntent, setPendingSendIntent] = useState(false);
  const [pendingRecipientQuery, setPendingRecipientQuery] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<{ subject: string; body: string } | null>(null);
  const [dialogRecipients, setDialogRecipients] = useState<string[]>([]);
  const [autoOpenedFromDraft, setAutoOpenedFromDraft] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskLeadId, setTaskLeadId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const { toast } = useToast();
  const details = personaConfig ?? getPersonaConfigForPersona(persona);
  const activePersonaId = (personaConfig?.id ?? persona.template.key) as PersonaId;

  useEffect(() => {
    setMessages([]);
    setError(null);
    setInput('');
    setPinnedMessageIds([]);
  }, [persona.template.id, persona.instance?.id]);

  const instance = persona.instance;

  const mentionQuery = useMemo(() => {
    if (chatMode !== 'team') return null;
    if (activePersonaId !== 'hatch_assistant') return null;
    const trimmed = input.trimStart();
    const match = trimmed.match(/^@([^\s:,\-]*)$/);
    return match ? (match[1] ?? '').toLowerCase() : null;
  }, [activePersonaId, chatMode, input]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const normalized = mentionQuery.trim();
    const base = (['hatch', 'echo', 'lumen', 'haven', 'atlas', 'nova'] as const).map((key) => {
      const personaId = DIRECT_PERSONA_MAP[key];
      const config = getPersonaConfigById(personaId);
      return { personaId, name: config?.shortName ?? config?.name ?? key };
    });
    if (!normalized) return base;
    return base.filter((entry) => entry.name.toLowerCase().startsWith(normalized));
  }, [mentionQuery]);

  const showMentionMenu = mentionQuery !== null && mentionCandidates.length > 0;

  useEffect(() => {
    setMentionHighlightIndex(0);
  }, [mentionQuery]);

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

  const sendingPreviewPersonaId = useMemo(() => {
    const prefix = resolveDirectPersonaPrefix(input.trim());
    if (chatMode === 'team' && activePersonaId === 'hatch_assistant' && prefix?.remainder) return prefix.personaId;
    return activePersonaId;
  }, [activePersonaId, chatMode, input]);

  const sendingPreviewPersona = useMemo(
    () => getPersonaConfigById(sendingPreviewPersonaId) ?? details,
    [details, sendingPreviewPersonaId]
  );

  const showSendingPill =
    chatMode === 'team' && activePersonaId === 'hatch_assistant' && resolveDirectPersonaPrefix(input.trim())?.remainder;

  useEffect(() => {
    if (!prefill) return;
    setInput(prefill);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prefill.length, prefill.length);
    });
    onPrefillConsumed?.();
  }, [onPrefillConsumed, prefill]);

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

  const clearChat = () => {
    if (messages.length === 0) return;
    if (!window.confirm('Clear this chat?')) return;
    setMessages([]);
    setPinnedMessageIds([]);
    setError(null);
    setPendingSendIntent(false);
    setPendingRecipientQuery(null);
    setAutoOpenedFromDraft(false);
    setLastDraft(null);
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied', description: 'Copied to clipboard.' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Unable to copy to clipboard.' });
    }
  };

  const openTaskDialogForContent = (content: string) => {
    const leadId = extractLeadId(content);
    if (!leadId) {
      toast({ variant: 'destructive', title: 'No leadId found', description: 'This message does not include a leadId.' });
      return;
    }
    setTaskLeadId(leadId);
    const firstLine = (content ?? '').split('\n')[0]?.trim() ?? '';
    setTaskTitle(firstLine ? `Follow up: ${firstLine}`.slice(0, 120) : 'Follow up');
    setTaskDueDate('');
    setTaskDialogOpen(true);
  };

  const createTask = async () => {
    if (!taskLeadId) return;
    const title = taskTitle.trim();
    if (!title) {
      toast({ variant: 'destructive', title: 'Missing title', description: 'Enter a task title.' });
      return;
    }

    const dueAt =
      taskDueDate.trim() !== ''
        ? new Date(`${taskDueDate}T17:00:00`).toISOString()
        : undefined;

    try {
      await createLeadTask(taskLeadId, { title, dueAt });
      toast({ title: 'Task created', description: `Added to lead ${taskLeadId}.` });
      setTaskDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create task.';
      toast({ variant: 'destructive', title: 'Task failed', description: message });
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
    setSendingPersonaId(activePersonaId);

    try {
      const direct = resolveDirectPersonaMessage(text, activePersonaId, allPersonas);
      const directMessage = chatMode === 'team' ? direct : null;
      if (directMessage) {
        setSendingPersonaId(directMessage.personaId);
      }

      const response = await chatAiEmployee(directMessage?.instanceId ?? instance.id, {
        message: directMessage?.message ?? text,
        channel,
        contextType,
        contextId
      });
      const assistantMessages: CopilotMessage[] = [];

      if (response.reply?.trim()) {
        assistantMessages.push({
          id: createMessageId(),
          role: 'assistant',
          personaId: directMessage?.personaId ?? activePersonaId,
          content: prettifyAssistantContent(response.reply)
        });
      }

      assistantMessages.push(
        ...buildMessagesFromActions(response.actions ?? [], directMessage?.personaId ?? activePersonaId)
      );

      if (assistantMessages.length === 0) {
        assistantMessages.push({
          id: createMessageId(),
          role: 'assistant',
          personaId: directMessage?.personaId ?? activePersonaId,
          content: 'Done.'
        });
      }

      setMessages((prev) => [...prev, ...assistantMessages]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to contact AI employee.';
      setMessages((prev) => [
        ...prev,
        { id: createMessageId(), role: 'assistant', content: `Error: ${message}` }
      ]);
      setError(message);
    } finally {
      setSending(false);
      setSendingPersonaId(null);
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
      <div className={cn('flex h-full min-h-0 flex-col', className)}>
        {/* Messages area - flex-1 priority */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
          {pinnedMessageIds.length > 0 && (
            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/35 p-2 backdrop-blur-xl shadow-sm">
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-amber-900/90">
                <span className="flex items-center gap-1">
                  <Pin className="h-3 w-3" />
                  Pinned
                </span>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-amber-900/70 hover:text-amber-900"
                  onClick={() => setPinnedMessageIds([])}
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1.5">
                {pinnedMessageIds.map((id) => {
                  const msg = messages.find((m) => m.id === id);
                  if (!msg) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="w-full rounded-xl border border-amber-200/70 bg-white/55 px-2 py-1 text-left text-[11px] text-slate-800 backdrop-blur-xl hover:bg-white/70"
                      onClick={() => {
                        const el = document.getElementById(`copilot-msg-${id}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {msg.content.slice(0, 140)}
                      {msg.content.length > 140 ? '…' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/35 bg-white/15 p-3 text-xs text-slate-700 backdrop-blur-xl">
              Ask {details.shortName} to summarize leads, draft outreach, or prep your next call.
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                fallbackPersonaId={activePersonaId}
                pinned={pinnedMessageIds.includes(message.id)}
                onTogglePin={() =>
                  setPinnedMessageIds((prev) =>
                    prev.includes(message.id) ? prev.filter((id) => id !== message.id) : [...prev, message.id]
                  )
                }
                onCopy={(value) => void copyToClipboard(value)}
                onDraftEmail={(value) => {
                  const draft = extractEmailDraft(value);
                  const subject = draft.subject?.trim() || '';
                  const body = draft.body?.trim() || value.trim();
                  openComposer({ subject, body }, null);
                }}
                onCreateTask={(value) => openTaskDialogForContent(value)}
              />
            ))
          )}
          {sending && <ThinkingIndicator personaId={sendingPersonaId ?? activePersonaId} />}
        </div>

        {error && (
          <div className="mx-3 mb-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-[10px] text-red-700">
            {error}
          </div>
        )}

        {/* Input area - flex-none, always visible */}
        {instance ? (
          <div className="flex-none border-t border-white/20 bg-white/15 px-3 py-2 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <SuggestionRow suggestions={details.examples} persona={details} onSelect={setSuggestion} />
              {messages.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/25 px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow-sm backdrop-blur-xl hover:bg-white/35"
                  onClick={clearChat}
                  title="Clear chat"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
            {showSendingPill ? (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span>Sending to</span>
                <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-semibold text-foreground">
                  <AiPersonaFace personaId={sendingPreviewPersonaId} size="sm" animated={false} />
                  <span>{sendingPreviewPersona.shortName ?? sendingPreviewPersona.name}</span>
                </span>
              </div>
            ) : null}
            <div className="mt-1.5 flex gap-2">
              <div className="relative flex-1">
                {showMentionMenu && (
                  <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-2xl border border-white/30 bg-white/75 shadow-xl backdrop-blur-xl">
                    <div className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                      Mention a persona
                    </div>
                    <div className="max-h-44 overflow-auto">
                      {mentionCandidates.map((candidate, idx) => (
                        <button
                          key={candidate.personaId}
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition ${
                            idx === mentionHighlightIndex ? 'bg-white/60' : 'hover:bg-white/45'
                          }`}
                          onMouseEnter={() => setMentionHighlightIndex(idx)}
                          onClick={() => {
                            const next = `@${candidate.name} `;
                            setInput(next);
                            requestAnimationFrame(() => {
                              inputRef.current?.focus();
                              inputRef.current?.setSelectionRange(next.length, next.length);
                            });
                          }}
                        >
                          <AiPersonaFace personaId={candidate.personaId} size="sm" animated={false} />
                          <span className="font-semibold">{candidate.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={details.placeholder}
                  className="min-h-[44px] max-h-[120px] w-full resize-none rounded-2xl border border-white/25 bg-white/25 px-3 py-2 text-[14px] leading-6 tracking-[-0.01em] text-slate-900 shadow-sm backdrop-blur-xl placeholder:text-slate-500 focus-visible:ring-0 focus-visible:border-white/40"
                  onKeyDown={(event) => {
                    if (showMentionMenu) {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setMentionHighlightIndex((prev) => Math.min(prev + 1, mentionCandidates.length - 1));
                        return;
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setMentionHighlightIndex((prev) => Math.max(prev - 1, 0));
                        return;
                      }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        const candidate = mentionCandidates[mentionHighlightIndex];
                        if (candidate) {
                          const next = `@${candidate.name} `;
                          setInput(next);
                          requestAnimationFrame(() => {
                            inputRef.current?.focus();
                            inputRef.current?.setSelectionRange(next.length, next.length);
                          });
                        }
                        return;
                      }
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!input.trim()) return;
                      void send();
                    }
                  }}
                />
              </div>
              <Button
                size="sm"
                disabled={!input.trim() || sending}
                onClick={() => void send()}
                className="self-end h-10 rounded-2xl bg-[#1F5FFF] px-4 text-[13px] shadow-sm hover:bg-[#1a52db]"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-none border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Provisioning...</span>
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

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create task</DialogTitle>
            <DialogDescription>{taskLeadId ? `Lead: ${taskLeadId}` : 'Select a message with a leadId.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-due">Due date (optional)</Label>
              <Input id="task-due" type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setTaskDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createTask()} disabled={!taskLeadId}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-600">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[12px] font-semibold shadow-sm backdrop-blur-xl hover:bg-white/25 hover:text-slate-800"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  fallbackPersonaId,
  pinned,
  onTogglePin,
  onCopy,
  onDraftEmail,
  onCreateTask
}: {
  message: CopilotMessage;
  fallbackPersonaId?: PersonaId;
  pinned: boolean;
  onTogglePin: () => void;
  onCopy: (value: string) => void;
  onDraftEmail: (value: string) => void;
  onCreateTask: (value: string) => void;
}) {
  const bubblePersonaId = message.role === 'assistant' ? message.personaId ?? fallbackPersonaId : undefined;
  const config = bubblePersonaId ? getPersonaConfigById(bubblePersonaId) : undefined;
  const headerLabel =
    message.role === 'assistant' && config && message.personaId && message.personaId !== fallbackPersonaId
      ? config.shortName
      : null;
  const assistantBg = bubblePersonaId ? PERSONA_COLORS[bubblePersonaId]?.color : undefined;
  const bubbleStyle: CSSProperties | undefined =
    message.role === 'assistant' && assistantBg
      ? {
          background: `linear-gradient(135deg, ${assistantBg}F2, ${assistantBg}C0)`,
          boxShadow: '0 12px 30px rgba(15,23,42,0.16)',
          border: '1px solid rgba(255,255,255,0.18)',
          backdropFilter: 'blur(14px)'
        }
      : message.role === 'user'
        ? {
            background:
              'linear-gradient(135deg, rgba(37,99,235,0.95), rgba(59,130,246,0.78))',
            boxShadow: '0 12px 30px rgba(15,23,42,0.16)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(14px)'
          }
        : undefined;

  return (
    <div
      id={`copilot-msg-${message.id}`}
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}
    >
      {message.role === 'assistant' && bubblePersonaId && (
        <div className="flex-shrink-0 mt-1">
          <AiPersonaFace personaId={bubblePersonaId} size="sm" animated active />
        </div>
      )}
      <div
        className="group relative max-w-[85%] overflow-hidden rounded-2xl px-3 py-2 font-display text-[13px] leading-6 tracking-[-0.01em] text-white antialiased [text-rendering:geometricPrecision]"
        style={bubbleStyle}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-70" />
        <div className="relative mb-1 flex items-start justify-between gap-2">
          <div className="flex items-center gap-1">
            {pinned && <Pin className="h-3 w-3 text-white/80" />}
            {headerLabel && <div className="text-[10px] font-semibold text-white/80">{headerLabel}</div>}
          </div>
          {message.role === 'assistant' && (
            <div className="opacity-0 transition-opacity group-hover:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white"
                    aria-label="Message actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onCopy(message.content)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onTogglePin}>
                    {pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                    {pinned ? 'Unpin' : 'Pin'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDraftEmail(message.content)}>Draft email</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(message.content)}>Draft SMS (copy)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCreateTask(message.content)}>Create task</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-p:leading-6 prose-li:leading-6 [&_*]:text-white">
          <ReactMarkdown
            components={{
              pre: ({ children }) => <div className="whitespace-pre-wrap break-words">{children}</div>,
              p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
              li: ({ children }) => <li className="whitespace-pre-wrap break-words">{children}</li>
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator({ personaId }: { personaId?: PersonaId }) {
  return (
    <div className="flex justify-start gap-2">
      {personaId && (
        <div className="flex-shrink-0 mt-1">
          <AiPersonaFace personaId={personaId} size="sm" animated active />
        </div>
      )}
      <div className="max-w-[85%] rounded-2xl border border-white/20 px-3 py-2 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur-xl bg-[linear-gradient(135deg,rgba(37,99,235,0.75),rgba(59,130,246,0.55))] flex items-center gap-2">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span className="text-xs text-white/80">Thinking...</span>
      </div>
    </div>
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

function buildMessagesFromActions(actions: AiEmployeeAction[], fallbackPersonaId: PersonaId): CopilotMessage[] {
  const messages: CopilotMessage[] = [];

  const pushPlain = (content: string, personaId: PersonaId) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    messages.push({ id: createMessageId(), role: 'assistant', personaId, content: trimmed });
  };

  for (const action of actions) {
    const status = (action.status ?? '').toLowerCase();
    if (status === 'failed') {
      const error = action.errorMessage ? `: ${action.errorMessage}` : '';
      pushPlain(`Tool failed (${action.actionType})${error}`, fallbackPersonaId);
      continue;
    }
    if (status !== 'executed') continue;

    if (action.actionType === 'coordinate_workflow') {
      const result = (action.result ?? action.payload) as unknown;
      const record = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : null;
      const results = record && Array.isArray(record.results) ? record.results : [];
      for (const entry of results) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const row = entry as Record<string, unknown>;
        const personaKey = typeof row.personaKey === 'string' ? row.personaKey : null;
        const reply = typeof row.reply === 'string' ? row.reply : null;
        if (!personaKey || !reply) continue;
        pushPlain(reply, personaKey as PersonaId);

        const toolReplies = Array.isArray(row.toolReplies) ? row.toolReplies : null;
        if (toolReplies) {
          for (const toolReply of toolReplies) {
            if (typeof toolReply !== 'string' || !toolReply.trim()) continue;
            if (/[{[]/.test(toolReply)) continue;
            pushPlain(toolReply, personaKey as PersonaId);
          }
        }
      }
      continue;
    }

    if (action.actionType === 'delegate_to_employee') {
      const result = (action.result ?? action.payload) as unknown;
      const record = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : null;
      const personaKey = record && typeof record.personaKey === 'string' ? record.personaKey : null;
      const reply = record && typeof record.reply === 'string' ? record.reply : null;
      if (personaKey && reply) {
        pushPlain(reply, personaKey as PersonaId);
        continue;
      }
    }

    if (typeof action.replyText === 'string' && action.replyText.trim().length > 0 && !/[{[]/.test(action.replyText)) {
      pushPlain(action.replyText, fallbackPersonaId);
    }
  }

  return messages;
}
