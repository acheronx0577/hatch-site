'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, Copy, MoreHorizontal, Pin, PinOff, Trash2, X } from 'lucide-react';

import { PERSONAS, type PersonaId, getPersonaConfigById } from '@/lib/ai/aiPersonas';
import { AiPersonaFace } from '@/components/ai/AiPersonaFace';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { wantsAiToSendEmail } from '@/lib/ai/sendIntent';
import { CopilotSendEmailDialog } from '@/components/copilot/CopilotSendEmailDialog';
import { extractEmailDraft } from '@/lib/ai/emailDraft';
import { lookupContactEmail, lookupContactEmailsFromString } from '@/lib/ai/contactLookup';
import { extractRecipientQuery } from '@/lib/ai/recipient';
import { useAuth } from '@/contexts/AuthContext';
import { createLeadTask } from '@/lib/api/hatch';
import { resolveUserIdentity } from '@/lib/utils';

type UIMsg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /**
   * Which AI persona authored this message. For user messages, this can capture
   * the persona context at send time. Rendering uses this for assistant bubbles
   * so messages keep their original author even after switching tabs.
   */
  personaId?: PersonaId;
};

export type HatchAIMessage = UIMsg;

type HatchAIWidgetProps = {
  onSend: (payload: {
    text: string;
    personaId: PersonaId;
    history: UIMsg[];
    forceCurrentPersona?: boolean;
  }) => Promise<{ activePersonaId: PersonaId; replies: UIMsg[] }>;
  isOpen?: boolean;
  onClose?: () => void;
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

const prettifyAssistantContent = (content: string) => {
  const summarizeJson = (raw: string) => {
    try {
      const data = JSON.parse(raw) as any;
      if (data?.tasks && data?.totals) {
        return `Daily summary: ${data.totals.newLeads ?? 0} new leads, ${data.totals.activeLeads ?? 0} active, ${data.totals.idleLeads ?? 0} idle. Tasks: ${data.tasks.open ?? 0} open, ${data.tasks.dueSoon ?? 0} due soon.`;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const stripCodeFences = (value: string) =>
    value.replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/```[a-zA-Z]*\s*/g, '').replace(/```$/, '').trim();
      const summary = summarizeJson(inner);
      return summary ? summary : '';
    });

  let formatted = content?.trim() ?? '';
  if (!formatted) return '';

  // Remove fenced code blocks and turn them into summaries if possible.
  formatted = stripCodeFences(formatted);

  // Strip any inline tool blocks (e.g., GET_DAILY_SUMMARY ... {json})
  formatted = formatted
    .replace(/^GET_[A-Z0-9_ -]+$/gim, '')
    .replace(/^COORDINATE_WORKFLOW$/gim, '')
    .replace(/^DELEGATE_TO_EMPLOYEE$/gim, '')
    .replace(/^EXECUTED$/gim, '')
    .replace(/Completed successfully\.?/gi, '');

  // Look for trailing/embedded JSON and turn it into a one-line summary.
  const braceIndex = formatted.lastIndexOf('{');
  if (braceIndex !== -1) {
    const jsonCandidate = formatted.slice(braceIndex);
    const summary = summarizeJson(jsonCandidate);
    if (summary) {
      formatted = formatted.slice(0, braceIndex).trim();
      formatted = formatted ? `${formatted}\n\n${summary}` : summary;
    } else {
      formatted = formatted.slice(0, braceIndex).trim();
    }
  }

  // Remove any leftover inline JSON to avoid code blocks.
  formatted = formatted.replace(/\{[\s\S]*?\}/g, '').replace(/\[[\s\S]*?\]/g, '').trim();

  // Collapse multiple blank lines.
  formatted = formatted.replace(/\n{2,}/g, '\n\n');

  return formatted;
};

// Enhanced Thinking Indicator Component with animations
const ThinkingIndicator: React.FC<{ isThinking: boolean }> = ({ isThinking }) => {
  if (!isThinking) return null;
  return (
    <div className="flex items-start gap-3 px-3 py-2 mt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Animated AI Avatar */}
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <div className="h-5 w-5 rounded-full bg-primary/80 animate-pulse relative z-10" />
      </div>
      
      {/* Thinking Bubble with Animated Dots */}
      <div className="flex-1 max-w-[85%]">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-white/25 px-4 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          {/* Animated thinking dots */}
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s] [animation-duration:1s]" />
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s] [animation-duration:1s]" />
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-duration:1s]" />
          </div>
          
          {/* Thinking text with shimmer effect */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-foreground/90">Thinking...</span>
            <span className="text-[10px] text-muted-foreground/70">Processing your request</span>
          </div>
        </div>
        
        {/* Typing indicator bars (subtle loading animation) */}
        <div className="flex gap-1 mt-2 ml-1">
          <div className="h-1 w-8 rounded-full bg-primary/30 animate-pulse [animation-delay:-0.4s]" />
          <div className="h-1 w-12 rounded-full bg-primary/20 animate-pulse [animation-delay:-0.2s]" />
          <div className="h-1 w-6 rounded-full bg-primary/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export function HatchAIWidget({ onSend, isOpen, onClose }: HatchAIWidgetProps) {
  // ...existing code...
  // ...existing code...
  const [showAllPersonas, setShowAllPersonas] = React.useState(false);
  // Close persona modal on Escape key
  React.useEffect(() => {
    if (!showAllPersonas) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAllPersonas(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAllPersonas]);

  // Number of persona chips to show before the "+N more" button
  const SHOW_PERSONA_CHIPS = 4;

  const isControlled = isOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isControlled ? Boolean(isOpen) : internalOpen;
  // For animation: controls mounting/unmounting
  const [show, setShow] = React.useState<boolean>(() => open);
  const [expanded, setExpanded] = React.useState(true);
  const [chatMode, setChatMode] = React.useState<'team' | 'direct'>('team');
  const [teamPersonaId, setTeamPersonaId] = React.useState<PersonaId>('hatch_assistant');
  const [directPersonaId, setDirectPersonaId] = React.useState<PersonaId>('hatch_assistant');
  const activePersonaId = chatMode === 'team' ? teamPersonaId : directPersonaId;
  const [messagesByThread, setMessagesByThread] = React.useState<Record<string, UIMsg[]>>({});
  const [input, setInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [lastFailedMessage, setLastFailedMessage] = React.useState<string | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false);
  const [emailDefaults, setEmailDefaults] = React.useState({ subject: '', body: '' });
  const [pendingSendIntent, setPendingSendIntent] = React.useState(false);
  const [pendingRecipientQuery, setPendingRecipientQuery] = React.useState<string | null>(null);
  const [lastDraft, setLastDraft] = React.useState<{ subject: string; body: string } | null>(null);
  const [dialogRecipients, setDialogRecipients] = React.useState<string[]>([]);
  const [autoOpenedFromDraft, setAutoOpenedFromDraft] = React.useState(false);
  const [mentionHighlightIndex, setMentionHighlightIndex] = React.useState(0);
  const [pinnedMessageIdsByThread, setPinnedMessageIdsByThread] = React.useState<Record<string, string[]>>({});
  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false);
  const [taskLeadId, setTaskLeadId] = React.useState<string | null>(null);
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskDueDate, setTaskDueDate] = React.useState('');
  const { session, user } = useAuth();
  const { toast } = useToast();

  const persona = PERSONAS.find((p) => p.id === activePersonaId)!;
  const threadKey = chatMode === 'team' ? 'team' : activePersonaId;
  const messages = messagesByThread[threadKey] ?? [];

  const mentionQuery = React.useMemo(() => {
    const trimmed = input.trimStart();
    const match = trimmed.match(/^@([^\s:,\-]*)$/);
    return match ? (match[1] ?? '').toLowerCase() : null;
  }, [input]);

  const mentionCandidates = React.useMemo(() => {
    if (mentionQuery === null) return [];
    const normalized = mentionQuery.trim();
    const all = PERSONAS.map((p) => ({ id: p.id, name: p.name }));
    if (!normalized) return all;
    return all.filter((p) => p.name.toLowerCase().startsWith(normalized));
  }, [mentionQuery]);

  const showMentionMenu = mentionQuery !== null && mentionCandidates.length > 0;

  React.useEffect(() => {
    setMentionHighlightIndex(0);
  }, [mentionQuery]);

  const sendingPreviewPersonaId = React.useMemo(() => {
    const prefix = resolveDirectPersonaPrefix(input.trim());
    return prefix ? prefix.personaId : activePersonaId;
  }, [activePersonaId, input]);

  const sendingPreviewPersona = React.useMemo(
    () => getPersonaConfigById(sendingPreviewPersonaId) ?? persona,
    [persona, sendingPreviewPersonaId]
  );

  const showSendingPill = chatMode === 'direct' || resolveDirectPersonaPrefix(input.trim()) !== null;

  const pinnedMessageIds = pinnedMessageIdsByThread[threadKey] ?? [];

  const setThreadMessages = React.useCallback(
    (key: string, updater: ((prev: UIMsg[]) => UIMsg[]) | UIMsg[]) => {
      setMessagesByThread((prev) => {
        const current = prev[key] ?? [];
        const next = typeof updater === 'function' ? (updater as (prev: UIMsg[]) => UIMsg[])(current) : updater;
        return { ...prev, [key]: next };
      });
    },
    []
  );

  const setPinnedMessageIds = React.useCallback((key: string, updater: ((prev: string[]) => string[]) | string[]) => {
    setPinnedMessageIdsByThread((prev) => {
      const current = prev[key] ?? [];
      const next = typeof updater === 'function' ? (updater as (prev: string[]) => string[])(current) : updater;
      return { ...prev, [key]: next };
    });
  }, []);

  const clearCurrentThread = React.useCallback(() => {
    if (messages.length === 0) return;
    if (!window.confirm('Clear this chat?')) return;
    setThreadMessages(threadKey, []);
    setPinnedMessageIds(threadKey, []);
    setLastFailedMessage(null);
    setPendingSendIntent(false);
    setPendingRecipientQuery(null);
    setAutoOpenedFromDraft(false);
    setLastDraft(null);
  }, [messages.length, setPinnedMessageIds, setThreadMessages, threadKey]);

  const copyToClipboard = React.useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        toast({ title: 'Copied', description: 'Copied to clipboard.' });
      } catch {
        toast({ variant: 'destructive', title: 'Copy failed', description: 'Unable to copy to clipboard.' });
      }
    },
    [toast]
  );

  const openTaskDialogForMessage = React.useCallback(
    (message: UIMsg) => {
      const leadId = extractLeadId(message.content);
      if (!leadId) {
        toast({ variant: 'destructive', title: 'No leadId found', description: 'This message does not include a leadId.' });
        return;
      }
      setTaskLeadId(leadId);
      const firstLine = prettifyAssistantContent(message.content).split('\n')[0]?.trim() ?? '';
      setTaskTitle(firstLine ? `Follow up: ${firstLine}`.slice(0, 120) : 'Follow up');
      setTaskDueDate('');
      setTaskDialogOpen(true);
    },
    [toast]
  );

  const createTask = React.useCallback(async () => {
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
  }, [taskDueDate, taskLeadId, taskTitle, toast]);

  React.useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      if (!message.content.toLowerCase().includes('subject')) continue;
      setLastDraft(extractEmailDraft(message.content));
      return;
    }
  }, [messages]);

  React.useEffect(() => {
    if (!pendingSendIntent || !lastDraft) return;
    openComposer(lastDraft, pendingRecipientQuery);
    setPendingSendIntent(false);
    setPendingRecipientQuery(null);
  }, [pendingRecipientQuery, pendingSendIntent, lastDraft]);

  // Auto-open composer when assistant replies with a draft that includes a Subject line
  React.useEffect(() => {
    if (emailDialogOpen || autoOpenedFromDraft) return;
    const assistant = [...messages].reverse().find((m) => m.role === 'assistant') ?? null;
    if (!assistant || !assistant.content) return;
    if (/\bsubject\s*:/i.test(assistant.content)) {
      const draft = extractEmailDraft(assistant.content);
      const lastUser = [...messages].reverse().find((m) => m.role === 'user') ?? null;
      const userQuery = pendingSendIntent
        ? pendingRecipientQuery
        : lastUser
          ? lastUser.content
          : null;
      openComposer(draft, userQuery ?? undefined);
      setAutoOpenedFromDraft(true);
    }
  }, [messages, emailDialogOpen, autoOpenedFromDraft]);

  const openComposer = (draft: { subject: string; body: string }, recipientQuery?: string | null) => {
    setEmailDefaults(draft);
    setEmailDialogOpen(true);
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

  const handleSend = async () => {
    const rawText = input.trim();
    if (!rawText || isSending) return;

    const prefix = resolveDirectPersonaPrefix(rawText);
    if (prefix && !prefix.remainder) {
      return;
    }

    const targetPersonaId = prefix?.remainder ? prefix.personaId : activePersonaId;
    const text = prefix?.remainder ? prefix.remainder : rawText;

    // Capture persona at the moment of send so any client-inserted
    // placeholder messages keep a stable author even if tabs switch later.
    const sendingPersona = targetPersonaId;
    const sendingThreadKey = chatMode === 'team' ? 'team' : targetPersonaId;
    const sendingMode = chatMode;
    const historyForSend = messagesByThread[sendingThreadKey] ?? (sendingThreadKey === threadKey ? messages : []);

    const userMsg: UIMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      personaId: targetPersonaId
    };

    if (sendingMode === 'direct' && directPersonaId !== targetPersonaId) {
      setDirectPersonaId(targetPersonaId);
    }

    setThreadMessages(sendingThreadKey, (prev) => [...prev, userMsg]);
    setInput('');

    if (wantsAiToSendEmail(text)) {
      const draft = lastDraft;
      if (draft) {
        setThreadMessages(sendingThreadKey, (prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Opening the email composer so you can send this now.',
            personaId: sendingPersona
          }
        ]);
        openComposer(draft, text);
        setPendingSendIntent(false);
        return;
      }
      // Do not open immediately; set pending and auto-open when Subject draft arrives
      setPendingSendIntent(true);
      setPendingRecipientQuery(text);
      setThreadMessages(sendingThreadKey, (prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Drafting your email. I’ll open the send window shortly.',
          personaId: sendingPersona
        }
      ]);
      // Do not return; continue to send the prompt to AI so a proper draft arrives
    }

    setIsSending(true);
    setLastFailedMessage(null); // Clear any previous failure
    try {
      const sentFromPersona = sendingPersona;
      const result = await onSend({
        text,
        personaId: sentFromPersona,
        history: [...historyForSend, userMsg],
        forceCurrentPersona:
          sendingMode === 'direct' || (prefix?.remainder ? targetPersonaId !== 'hatch_assistant' : false)
      });

      if (sendingMode === 'team') {
        setTeamPersonaId(result.activePersonaId);
      }
      // Ensure assistant replies keep the persona that answered at the time
      // of this turn. If the backend doesn't annotate personaId per message,
      // fall back to the persona used to send the prompt.
      const attributed = result.replies.map((m) => {
        const content = m.role === 'assistant' ? prettifyAssistantContent(m.content) : m.content;
        return m.role === 'assistant' && !m.personaId
          ? { ...m, personaId: sentFromPersona, content }
          : { ...m, content };
      });
      setThreadMessages(sendingThreadKey, (prev) => [...prev, ...attributed]);
    } catch (error) {
      console.error(error);
      setLastFailedMessage(text); // Save failed message for retry

      // Determine error type for better messaging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNetworkError = errorMessage.toLowerCase().includes('network') ||
                            errorMessage.toLowerCase().includes('fetch') ||
                            errorMessage.toLowerCase().includes('connection');
      const isTimeoutError = errorMessage.toLowerCase().includes('timeout');

      let userFriendlyMessage = 'Sorry — something went wrong talking to your AI coworker.';
      if (isNetworkError) {
        userFriendlyMessage = 'Connection issue detected. Check your internet connection and try again.';
      } else if (isTimeoutError) {
        userFriendlyMessage = 'The request timed out. The AI might be busy — please try again.';
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        userFriendlyMessage = 'Authentication error. You may need to sign in again.';
      } else if (errorMessage.includes('429')) {
        userFriendlyMessage = 'Too many requests. Please wait a moment before trying again.';
      } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
        userFriendlyMessage = 'Server error. Our team has been notified. Please try again in a moment.';
      }

      setThreadMessages(sendingThreadKey, (prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: userFriendlyMessage,
          personaId: sendingPersona
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
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
          setInput(`@${candidate.name} `);
        }
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const openWidget = React.useCallback(() => {
    if (isControlled) return;
    setShow(true);
    setTimeout(() => setInternalOpen(true), 10);
  }, [isControlled]);

  const closeWidget = React.useCallback(() => {
    if (!isControlled) {
      setInternalOpen(false);
    }
    onClose?.();
  }, [isControlled, onClose]);


  // Handle mounting/unmounting for animation
  React.useEffect(() => {
    if (open && !show) setShow(true);
    else if (!open && show) {
      const timeout = setTimeout(() => setShow(false), 250);
      return () => clearTimeout(timeout);
    }
  }, [open, show]);

  // Keyboard shortcut: Cmd+K (Mac) or Ctrl+K (Windows/Linux) to open
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if (!isControlled && (event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault(); // Prevent browser's default search behavior
        if (!open) openWidget();
      }
      // ESC to close
      if (event.key === 'Escape' && open) {
        closeWidget();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeWidget, isControlled, open, openWidget]);

  if (!open && !show) {
    if (isControlled) return null;
    return (
      <button
        type="button"
        onClick={openWidget}
        aria-label="Open Hatch AI"
        className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-40 flex h-14 sm:h-12 items-center gap-2 rounded-full bg-[#1F5FFF] px-4 sm:px-4 text-sm font-medium text-white shadow-lg antialiased [text-rendering:geometricPrecision] transition-all duration-200 motion-safe:will-change-transform scale-100 hover:scale-105 active:scale-95 touch-manipulation"
      >
        <AiPersonaFace personaId="hatch_assistant" size="sm" animated />
        <span className="hidden sm:inline">Ask Hatch AI</span>
      </button>
    );
  }

  return (
    <div>
    <div
      className={`fixed bottom-0 sm:bottom-4 right-0 sm:right-4 left-0 sm:left-auto z-40 flex flex-col items-end transition-all duration-300 ease-in-out
        ${open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      style={{ willChange: 'opacity, transform' }}
    >
      <div className="relative w-full sm:w-[460px] max-h-[100vh] sm:max-h-[80vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/25 bg-white/55 font-display antialiased [text-rendering:geometricPrecision] shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur-xl">
        {/* Glass highlights */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-white/0" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.18),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_110%_40%,rgba(236,72,153,0.12),transparent_45%)]" />

        <div className="relative">
          {/* HEADER */}
          <div className="flex items-center justify-between border-b border-white/20 bg-white/25 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <AiPersonaFace personaId={activePersonaId} size="lg" animated active />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-900">
                  {chatMode === 'team' ? 'Team chat' : 'Direct chat'} · {persona.name}
                </span>
                <span className="text-[11px] text-slate-600">{persona.tagline}</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <div className="mr-2 hidden sm:flex items-center rounded-full border border-white/20 bg-white/25 p-0.5 text-[11px] backdrop-blur-xl">
                <button
                  type="button"
                  className={`rounded-full px-2 py-0.5 font-semibold transition ${
                    chatMode === 'team'
                      ? 'bg-white/35 text-slate-900 shadow-sm'
                      : 'text-slate-700 hover:bg-white/20'
                  }`}
                  onClick={() => {
                    setTeamPersonaId(activePersonaId);
                    setChatMode('team');
                  }}
                >
                  Team
                </button>
                <button
                  type="button"
                  className={`rounded-full px-2 py-0.5 font-semibold transition ${
                    chatMode === 'direct'
                      ? 'bg-white/35 text-slate-900 shadow-sm'
                      : 'text-slate-700 hover:bg-white/20'
                  }`}
                  onClick={() => {
                    setDirectPersonaId(activePersonaId);
                    setChatMode('direct');
                  }}
                >
                  Direct
                </button>
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-slate-700 hover:bg-white/25"
                onClick={clearCurrentThread}
                aria-label="Clear chat"
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-full p-1 text-slate-700 hover:bg-white/25"
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              <button
                type="button"
                className="rounded-full p-1 text-slate-700 hover:bg-white/25"
                onClick={closeWidget}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

        <div
          style={{
            maxHeight: expanded ? 1000 : 0,
            opacity: expanded ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s cubic-bezier(0.4,0,0.2,1)'
          }}
        >
          {/* PERSONA CHIPS - Horizontal, no selection border, functional +N more */}
          <div className="flex w-full max-w-full gap-2 overflow-x-auto overflow-y-hidden px-4 pt-3 pb-2 pr-5">
            {/* Show up to SHOW_PERSONA_CHIPS personas, skipping 'market_analyst' (Atlas) unless in modal */}
            {(() => {
              // Find Atlas index
              const atlasIdx = PERSONAS.findIndex(p => p.id === 'market_analyst');
              // Compose visible personas: first 2, then skip Atlas, then next 2 (excluding Atlas)
              let visible = PERSONAS.filter((p, i) => i < 2 || (i > 2 && p.id !== 'market_analyst')).slice(0, SHOW_PERSONA_CHIPS);
              // If Atlas is in the first SHOW_PERSONA_CHIPS, remove it and add the next persona after SHOW_PERSONA_CHIPS
              if (visible.some(p => p.id === 'market_analyst')) {
                const withoutAtlas = visible.filter(p => p.id !== 'market_analyst');
                if (PERSONAS[SHOW_PERSONA_CHIPS]) withoutAtlas.push(PERSONAS[SHOW_PERSONA_CHIPS]);
                visible = withoutAtlas;
              }
              // Calculate the number of hidden personas for the '+N more' button
              const numVisible = visible.length;
              const numHidden = PERSONAS.length - numVisible;
              return (
                <>
                  {visible.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => (chatMode === 'team' ? setTeamPersonaId(p.id) : setDirectPersonaId(p.id))}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition backdrop-blur-xl ${
                        p.id === activePersonaId
                          ? 'border-white/30 bg-white/35 text-slate-900 shadow-sm'
                          : 'border-white/20 bg-white/15 text-slate-700 hover:bg-white/25'
                      }`}
                      title={p.name}
                    >
                      <AiPersonaFace personaId={p.id} size="sm" animated active={p.id === activePersonaId} />
                      <span className="truncate max-w-[80px] text-slate-900" title={p.name}>{p.name}</span>
                    </button>
                  ))}
                  {numHidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllPersonas(true)}
                      className="flex items-center justify-center rounded-full border border-dashed border-white/35 bg-white/20 px-3 py-1.5 text-[12px] font-bold text-slate-800 shadow-sm backdrop-blur-xl hover:bg-white/30 transition"
                      title={`Show ${numHidden} more personas`}
                    >
                      +{numHidden} more
                    </button>
                  )}
                </>
              );
            })()}
          </div>

          {/* Modal/Popover for all personas */}
          {showAllPersonas && (
            <div className="fixed inset-0 z-50 flex items-center justify-center rounded-2xl" style={{background: 'rgba(30,41,59,0.18)', backdropFilter: 'blur(2px)'}} onClick={() => setShowAllPersonas(false)}>
              <div className="rounded-2xl border border-white/30 bg-white/75 shadow-2xl p-6 min-w-[320px] max-w-[90vw] backdrop-blur-xl" onClick={e => e.stopPropagation()}>
                <div className="mb-3 text-lg font-bold text-slate-900">Select a Persona</div>
                <div className="grid grid-cols-2 gap-2">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (chatMode === 'team') setTeamPersonaId(p.id);
                        else setDirectPersonaId(p.id);
                        setShowAllPersonas(false);
                      }}
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-semibold transition backdrop-blur-xl ${
                        p.id === activePersonaId
                          ? 'border-white/30 bg-white/35 text-slate-900 shadow-sm'
                          : 'border-white/20 bg-white/15 text-slate-700 hover:bg-white/25'
                      }`}
                      title={p.name}
                    >
                      <AiPersonaFace personaId={p.id} size="sm" animated active={p.id === activePersonaId} />
                      <span className="truncate max-w-[100px] text-slate-900" title={p.name}>{p.name}</span>
                    </button>
                  ))}
                </div>
                <button className="mt-4 w-full rounded-xl border border-white/25 bg-white/35 text-slate-900 py-2 font-semibold shadow-sm hover:bg-white/45 transition backdrop-blur-xl" onClick={() => setShowAllPersonas(false)}>Close</button>
              </div>
            </div>
          )}

          {/* MESSAGES */}
          <div className="max-h-[40vh] sm:max-h-[300px] space-y-4 overflow-y-auto px-4 py-3 text-[14px] leading-6 tracking-[-0.01em]">
            {pinnedMessageIds.length > 0 && (
              <div className="rounded-2xl border border-amber-200/60 bg-amber-50/35 px-3 py-2 shadow-sm backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-amber-900">
                  <span className="inline-flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </span>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-amber-900/80 hover:text-amber-900"
                    onClick={() => setPinnedMessageIds(threadKey, [])}
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-2">
                  {pinnedMessageIds.map((id) => {
                    const msg = messages.find((m) => m.id === id);
                    if (!msg) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="w-full rounded-xl border border-amber-200/70 bg-white/55 px-2 py-1 text-left text-[12px] leading-snug shadow-sm backdrop-blur-xl hover:bg-white/70"
                        onClick={() => {
                          const el = document.getElementById(`hatch-msg-${id}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                      >
                        {prettifyAssistantContent(msg.content).slice(0, 140)}
                        {msg.content.length > 140 ? '…' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-white/25 bg-white/20 px-3 py-3 text-[13px] leading-6 text-slate-800 shadow-sm backdrop-blur-xl">
                Ask {persona.name} anything about{' '}
                {persona.tagline.toLowerCase()} — or choose one of the starter prompts below. Echo, for example, can look at your CRM data and tell you exactly who to call first.
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === 'user';
                const isPinned = pinnedMessageIds.includes(message.id);
                return (
                  <div
                    key={message.id}
                    id={`hatch-msg-${message.id}`}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {isUser ? (
                      <div className="max-w-[80%] rounded-2xl border border-white/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.95),rgba(59,130,246,0.78))] px-3 py-2 text-[14px] leading-6 tracking-[-0.01em] text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur-xl">
                        {message.content}
                      </div>
                    ) : (
                      <div className="group max-w-[90%] rounded-2xl border border-white/30 bg-white/45 px-3 py-2 text-[14px] leading-6 tracking-[-0.01em] text-slate-900 shadow-sm backdrop-blur-xl">
                        {(() => {
                          const msgPersonaId = (message as UIMsg).personaId ?? activePersonaId;
                          const msgPersona = getPersonaConfigById(msgPersonaId) ?? persona;
                          return (
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                <AiPersonaFace personaId={msgPersona.id} size="sm" animated={false} />
                                <span>{msgPersona.name}</span>
                              </div>
                              <div className="opacity-0 transition-opacity group-hover:opacity-100">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="rounded-full p-1 text-slate-600 hover:bg-white/35 hover:text-slate-900"
                                      aria-label="Message actions"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => void copyToClipboard(prettifyAssistantContent(message.content))}>
                                      <Copy className="mr-2 h-4 w-4" />
                                      Copy
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setPinnedMessageIds(threadKey, (prev) =>
                                          prev.includes(message.id) ? prev.filter((id) => id !== message.id) : [...prev, message.id]
                                        )
                                      }
                                    >
                                      {isPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                                      {isPinned ? 'Unpin' : 'Pin'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        const draft = extractEmailDraft(message.content);
                                        const subject = draft.subject?.trim() || '';
                                        const body = draft.body?.trim() || prettifyAssistantContent(message.content);
                                        openComposer({ subject, body }, null);
                                      }}
                                    >
                                      Draft email
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void copyToClipboard(prettifyAssistantContent(message.content))}>
                                      Draft SMS (copy)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openTaskDialogForMessage(message)}>
                                      Create task
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="hatch-markdown text-[14px] leading-6">
                          <ReactMarkdown
                            components={{
                              pre: ({ children }) => <div className="whitespace-pre-wrap">{children}</div>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              p: ({ children }) => (
                                <p className="mb-1 whitespace-pre-wrap break-words text-[14px] leading-6 last:mb-0">{children}</p>
                              ),
                              li: ({ children }) => (
                                <li className="ml-5 list-disc whitespace-pre-wrap break-words text-[14px] leading-6">{children}</li>
                              ),
                              ul: ({ children }) => <ul className="my-1 ml-1 space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="my-1 ml-1 list-decimal space-y-1">{children}</ol>,
                              code: ({ inline, children }) =>
                                inline ? (
                                  <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{children}</code>
                                ) : (
                                  <span className="whitespace-pre-wrap text-[14px] leading-6">{children}</span>
                                )
                            }}
                          >
                            {message.role === 'assistant' ? prettifyAssistantContent(message.content) : message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <ThinkingIndicator isThinking={isSending} />
          </div>

          {/* QUICK SUGGESTIONS / RETRY */}
          <div className="flex flex-wrap gap-1 px-4 pb-2">
            {lastFailedMessage && (
              <button
                key="retry"
                type="button"
                onClick={() => {
                  setInput(lastFailedMessage);
                  setLastFailedMessage(null);
                }}
                className="rounded-full border border-red-300/60 bg-red-50/60 px-3 py-1 text-[11px] font-semibold text-red-700 shadow-sm backdrop-blur-xl hover:bg-red-50/80 transition-colors"
              >
                ↻ Try Again
              </button>
            )}
            {!lastFailedMessage && persona.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-xl hover:bg-white/25"
              >
                {example}
              </button>
            ))}
          </div>

          {/* INPUT */}
          <div className="border-t border-white/20 bg-white/15 px-4 py-3 backdrop-blur-xl">
            {showSendingPill && (
              <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-600">
                <span>Sending to</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/25 px-2 py-0.5 font-semibold text-slate-900 shadow-sm backdrop-blur-xl">
                  <AiPersonaFace personaId={sendingPreviewPersona.id} size="sm" animated={false} />
                  <span>{sendingPreviewPersona.name}</span>
                  <span className="text-[10px] font-medium text-slate-600">
                    {chatMode === 'direct' ? 'Direct' : 'Team'}
                  </span>
                </span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                {showMentionMenu && (
                  <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-2xl border border-white/30 bg-white/75 shadow-xl backdrop-blur-xl">
                    <div className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                      Mention a persona
                    </div>
                    <div className="max-h-44 overflow-auto">
                      {mentionCandidates.map((candidate, idx) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition ${
                            idx === mentionHighlightIndex ? 'bg-white/60' : 'hover:bg-white/45'
                          }`}
                          onMouseEnter={() => setMentionHighlightIndex(idx)}
                          onClick={() => setInput(`@${candidate.name} `)}
                        >
                          <AiPersonaFace personaId={candidate.id} size="sm" animated={false} />
                          <span className="font-semibold">{candidate.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={persona.placeholder}
                  rows={2}
                  className="min-h-[46px] max-h-[110px] resize-none rounded-2xl border border-white/25 bg-white/25 px-3 py-2 text-[14px] leading-6 tracking-[-0.01em] text-slate-900 shadow-sm backdrop-blur-xl placeholder:text-slate-500 focus-visible:ring-0 focus-visible:border-white/40"
                />
              </div>
              <Button 
                type="button" 
                size="sm" 
                disabled={
                  isSending ||
                  !input.trim() ||
                  (Boolean(resolveDirectPersonaPrefix(input.trim())) &&
                    !resolveDirectPersonaPrefix(input.trim())?.remainder)
                } 
                onClick={handleSend}
                className="rounded-2xl bg-[#1F5FFF] shadow-sm transition-all duration-200 hover:bg-[#1a52db] hover:scale-105 active:scale-95 will-change-transform"
                aria-busy={isSending}
                aria-live="polite"
              >
                {isSending ? (
                  <>
                    <span className="flex items-center gap-0.5" aria-hidden="true">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s] [animation-duration:0.8s]" />
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s] [animation-duration:0.8s]" />
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-duration:0.8s]" />
                    </span>
                    <span className="sr-only">Sending…</span>
                  </>
                ) : (
                  'Send'
                )}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-slate-600">
              <kbd className="hidden sm:inline rounded bg-white/25 px-1 py-0.5 border border-white/25 backdrop-blur-xl">⌘K</kbd>
              <kbd className="hidden sm:inline rounded bg-white/25 px-1 py-0.5 ml-1 border border-white/25 backdrop-blur-xl">Ctrl+K</kbd>
              <span className="hidden sm:inline"> to open · </span>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
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
      defaultSenderName={resolveUserIdentity(session?.profile, user?.email).displayName}
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
    </div>
  );
}
