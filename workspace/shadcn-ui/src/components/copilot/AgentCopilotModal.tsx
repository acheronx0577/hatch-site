"use client";

import * as React from 'react';
import { X } from 'lucide-react';

import { PersonaSelector } from './PersonaSelector';
import { AgentChatWindow } from './AgentChatWindow';
import type { PersonaId } from '@/lib/ai/aiPersonas';
import { Button } from '@/components/ui/button';
import { CopilotSendEmailDialog } from './CopilotSendEmailDialog';
import { extractEmailDraft } from '@/lib/ai/emailDraft';
import { wantsAiToSendEmail } from '@/lib/ai/sendIntent';
import { createMessageId } from '@/lib/ai/message';
import { lookupContactEmail, lookupContactEmailsFromString } from '@/lib/ai/contactLookup';
import { extractRecipientQuery } from '@/lib/ai/recipient';

export type AgentCopilotMessage = { id: string; role: 'user' | 'assistant'; content: string };

type AgentCopilotModalProps = {
  open: boolean;
  onClose: () => void;
  activePersonaId: PersonaId;
  setActivePersonaId: (id: PersonaId) => void;
  messages: AgentCopilotMessage[];
  onSendMessage: (text: string, personaId: PersonaId) => void;
  onAppendMessages?: (messages: AgentCopilotMessage[]) => void;
  defaultRecipients?: string[];
  senderName?: string;
};

export function AgentCopilotModal({
  open,
  onClose,
  activePersonaId,
  setActivePersonaId,
  messages,
  onSendMessage,
  onAppendMessages,
  defaultRecipients,
  senderName
}: AgentCopilotModalProps) {
  const [input, setInput] = React.useState('');
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false);
  const [emailDefaults, setEmailDefaults] = React.useState({ subject: '', body: '' });
  const [pendingSendIntent, setPendingSendIntent] = React.useState(false);
  const [pendingRecipientQuery, setPendingRecipientQuery] = React.useState<string | null>(null);
  const [lastDraft, setLastDraft] = React.useState<{ subject: string; body: string } | null>(null);
  const [dialogRecipients, setDialogRecipients] = React.useState<string[]>(defaultRecipients ?? []);
  const [autoOpenedFromDraft, setAutoOpenedFromDraft] = React.useState(false);
  const [contextRecipient, setContextRecipient] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const lastAssistantMessage = React.useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant') ?? null,
    [messages]
  );

  const lastUserMessage = React.useMemo(
    () => [...messages].reverse().find((message) => message.role === 'user') ?? null,
    [messages]
  );

  React.useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      if (!message.content?.toLowerCase().includes('subject')) continue;
      setLastDraft(extractEmailDraft(message.content));
      return;
    }
  }, [messages]);

  React.useEffect(() => {
    if (!pendingSendIntent || !lastDraft) return;
    void openComposer(lastDraft, pendingRecipientQuery);
    setPendingSendIntent(false);
    setPendingRecipientQuery(null);
  }, [pendingRecipientQuery, pendingSendIntent, lastDraft]);

  React.useEffect(() => {
    setDialogRecipients(defaultRecipients ?? []);
  }, [defaultRecipients]);

  // Listen for Copilot context (e.g., currently focused lead) to prefill recipient
  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail as Record<string, unknown> | undefined;
      const metadata = (detail?.metadata ?? {}) as Record<string, unknown>;
      const candidateKeys = ['email', 'primaryEmail', 'contactEmail', 'personEmail', 'leadEmail'];
      const values = candidateKeys
        .map((key) => (detail as any)?.[key])
        .concat(candidateKeys.map((key) => metadata[key]));
      const recipient = values.find((v) => typeof v === 'string' && v.includes('@')) as string | undefined;
      setContextRecipient(recipient ?? null);
    };
    window.addEventListener('copilot:context', handler as EventListener);
    return () => window.removeEventListener('copilot:context', handler as EventListener);
  }, []);

  const openComposer = (draft: { subject: string; body: string }, recipientQuery?: string | null) => {
    setEmailDefaults(draft);
    setEmailDialogOpen(true);
    if (defaultRecipients?.length) {
      setDialogRecipients(defaultRecipients);
      return;
    }
    if (contextRecipient) {
      setDialogRecipients([contextRecipient]);
      return;
    }
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

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const wantsSend = wantsAiToSendEmail(trimmed);
    if (wantsSend && onAppendMessages) {
      const draft =
        lastDraft ?? (lastAssistantMessage ? extractEmailDraft(lastAssistantMessage.content) : null);
      const recipientQuery = trimmed; // allow multiple recipients or raw emails to be extracted later
      if (draft) {
        const userMessage: AgentCopilotMessage = { id: createMessageId(), role: 'user', content: trimmed };
        const assistantMessage: AgentCopilotMessage = {
          id: createMessageId(),
          role: 'assistant',
          content: 'Opening the email composer so you can send this right away.'
        };
        onAppendMessages([userMessage, assistantMessage]);
        openComposer(draft, recipientQuery);
        setInput('');
        setPendingSendIntent(false);
        return;
      }
      // No draft yet — do not open immediately; auto-open when the assistant returns a Subject line
      setPendingSendIntent(true);
      setPendingRecipientQuery(recipientQuery ?? null);
      // Still send the prompt so the proper draft arrives
    }

    onSendMessage(trimmed, activePersonaId);
    setInput('');
  };

  const handleSendEmail = () => {
    const draft = lastDraft ?? (lastAssistantMessage ? extractEmailDraft(lastAssistantMessage.content) : null);
    if (!draft) return;
    const userQuery = lastUserMessage ? lastUserMessage.content : null;
    openComposer(draft, userQuery);
  };

  // Auto-open when assistant returns a draft with a Subject line, even if user didn't use exact trigger words.
  React.useEffect(() => {
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

  const hasAssistantDraft = Boolean(lastDraft ?? lastAssistantMessage?.content?.trim());

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="pointer-events-none flex w-full justify-center px-4 pb-6" onClick={(event) => event.stopPropagation()}>
        <div className="pointer-events-auto flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agent Copilot</span>
              <span className="text-sm text-muted-foreground">Workspace · tenant scoped</span>
            </div>
            <button
              type="button"
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 py-3">
            <PersonaSelector activeId={activePersonaId} onSelect={setActivePersonaId} />

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {['New leads today', 'Overdue follow-ups', 'Draft emails pending'].map((label) => (
                <div key={label} className="rounded-xl border px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">{label.toUpperCase()}</div>
                  <div className="text-sm font-semibold">—</div>
                </div>
              ))}
            </div>

            <AgentChatWindow
              activePersonaId={activePersonaId}
              messages={messages}
              input={input}
              setInput={setInput}
              onSend={handleSend}
            />

            <div className="rounded-2xl border border-dashed border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Need to send the latest reply as an email?</span>
                <Button size="xs" variant="secondary" disabled={!hasAssistantDraft} onClick={handleSendEmail}>
                  Send with AI
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            Agent Copilot may make mistakes. Verify important details before acting.
          </div>
        </div>
      </div>

      <CopilotSendEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        defaultPersonaId={activePersonaId}
        defaultSubject={emailDefaults.subject}
        defaultBody={emailDefaults.body}
        defaultRecipients={dialogRecipients}
        defaultSenderName={senderName}
      />
    </div>
  );
}
