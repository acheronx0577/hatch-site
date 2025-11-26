'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

import { PERSONAS, type PersonaId, getPersonaConfigById } from '@/lib/ai/aiPersonas';
import { AiPersonaFace } from '@/components/ai/AiPersonaFace';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { wantsAiToSendEmail } from '@/lib/ai/sendIntent';
import { CopilotSendEmailDialog } from '@/components/copilot/CopilotSendEmailDialog';
import { extractEmailDraft } from '@/lib/ai/emailDraft';
import { lookupContactEmail, lookupContactEmailsFromString } from '@/lib/ai/contactLookup';
import { extractRecipientQuery } from '@/lib/ai/recipient';
import { useAuth } from '@/contexts/AuthContext';
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
  }) => Promise<{ activePersonaId: PersonaId; replies: UIMsg[] }>;
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
        <div className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-muted to-muted/80 px-4 py-2.5 shadow-sm border border-border/50">
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

export function HatchAIWidget({ onSend }: HatchAIWidgetProps) {
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

  const [open, setOpen] = React.useState(false);
  // For animation: controls mounting/unmounting
  const [show, setShow] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);
  const [activePersonaId, setActivePersonaId] = React.useState<PersonaId>('agent_copilot');
  const [messages, setMessages] = React.useState<UIMsg[]>([]);
  const [input, setInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false);
  const [emailDefaults, setEmailDefaults] = React.useState({ subject: '', body: '' });
  const [pendingSendIntent, setPendingSendIntent] = React.useState(false);
  const [pendingRecipientQuery, setPendingRecipientQuery] = React.useState<string | null>(null);
  const [lastDraft, setLastDraft] = React.useState<{ subject: string; body: string } | null>(null);
  const [dialogRecipients, setDialogRecipients] = React.useState<string[]>([]);
  const [autoOpenedFromDraft, setAutoOpenedFromDraft] = React.useState(false);
  const { session, user } = useAuth();

  const persona = PERSONAS.find((p) => p.id === activePersonaId)!;

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
    const text = input.trim();
    if (!text || isSending) return;
    // Capture persona at the moment of send so any client-inserted
    // placeholder messages keep a stable author even if tabs switch later.
    const sendingPersona = activePersonaId;

    const userMsg: UIMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      personaId: activePersonaId
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    if (wantsAiToSendEmail(text)) {
      const draft = lastDraft;
      if (draft) {
        setMessages((prev) => [
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
      setMessages((prev) => [
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
    try {
      const sentFromPersona = sendingPersona;
      const result = await onSend({
        text,
        personaId: activePersonaId,
        history: [...messages, userMsg]
      });

      setActivePersonaId(result.activePersonaId);
      // Ensure assistant replies keep the persona that answered at the time
      // of this turn. If the backend doesn't annotate personaId per message,
      // fall back to the persona used to send the prompt.
      const attributed = result.replies.map((m) =>
        m.role === 'assistant' && !m.personaId ? { ...m, personaId: sentFromPersona } : m
      );
      setMessages((prev) => [...prev, ...attributed]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry — something went wrong talking to your AI coworker. Try again in a moment.',
          personaId: sendingPersona
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };


  // Handle mounting/unmounting for animation
  React.useEffect(() => {
    if (open && !show) {
      // Mount first, then trigger transition on next tick
      setShow(true);
    } else if (!open && show) {
      // Delay unmount for animation
      const timeout = setTimeout(() => setShow(false), 250);
      return () => clearTimeout(timeout);
    }
  }, [open, show]);

  if (!open && !show) {
    return (
      <button
        type="button"
        onClick={() => {
          setShow(true);
          setTimeout(() => setOpen(true), 10); // ensure mount before open for animation
        }}
        className="fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-[#1F5FFF] px-4 text-sm font-medium text-white shadow-lg antialiased [text-rendering:geometricPrecision] transition-all duration-200 motion-safe:will-change-transform scale-100 hover:scale-105 active:scale-97"
      >
        <AiPersonaFace personaId="agent_copilot" size="sm" animated />
        <span>Ask Hatch AI</span>
      </button>
    );
  }

  return (
    <div>
    <div
      className={`fixed bottom-4 right-4 z-40 flex flex-col items-end transition-all duration-300 ease-in-out
        ${open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      style={{ willChange: 'opacity, transform' }}
    >
      <div className="w-[460px] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <AiPersonaFace personaId={activePersonaId} size="lg" animated active />
            <div className="flex flex-col">
              <span className="text-xs font-semibold">New chat · {persona.name}</span>
              <span className="text-[11px] text-muted-foreground">{persona.tagline}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-full p-1 hover:bg-muted"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
            <button type="button" className="rounded-full p-1 hover:bg-muted" onClick={() => setOpen(false)} aria-label="Close">
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
          <div className="flex gap-2 px-4 pt-3 pb-2">
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
                      onClick={() => setActivePersonaId(p.id)}
                      className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold bg-white hover:bg-blue-50 hover:text-blue-900 transition"
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
                      className="flex items-center justify-center rounded-full border border-dashed border-blue-300 px-3 py-1.5 text-[12px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition"
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
              <div className="bg-white/90 rounded-2xl shadow-2xl p-6 min-w-[320px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
                <div className="mb-3 text-lg font-bold text-slate-900">Select a Persona</div>
                <div className="grid grid-cols-2 gap-2">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setActivePersonaId(p.id); setShowAllPersonas(false); }}
                      className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-[13px] font-semibold bg-white hover:bg-blue-50 hover:text-blue-900 transition"
                      title={p.name}
                    >
                      <AiPersonaFace personaId={p.id} size="sm" animated active={p.id === activePersonaId} />
                      <span className="truncate max-w-[100px] text-slate-900" title={p.name}>{p.name}</span>
                    </button>
                  ))}
                </div>
                <button className="mt-4 w-full rounded-md bg-blue-100 text-blue-700 py-2 font-semibold hover:bg-blue-200 transition" onClick={() => setShowAllPersonas(false)}>Close</button>
              </div>
            </div>
          )}

          {/* MESSAGES */}
          <div className="max-h-[300px] space-y-4 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed">
            {messages.length === 0 ? (
              <div className="rounded-xl bg-muted/60 px-3 py-3 text-[12px] text-muted-foreground">
                Ask {persona.name} anything about{' '}
                {persona.tagline.toLowerCase()} — or choose one of the starter prompts below. Echo, for example, can look at your CRM data and tell you exactly who to call first.
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {isUser ? (
                      <div className="max-w-[80%] rounded-2xl bg-[#1F5FFF] px-3 py-2 text-[13px] leading-relaxed text-white">{message.content}</div>
                    ) : (
                      <div className="max-w-[90%] rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-900">
                        {(() => {
                          const msgPersonaId = (message as UIMsg).personaId ?? activePersonaId;
                          const msgPersona = getPersonaConfigById(msgPersonaId) ?? persona;
                          return (
                            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              <AiPersonaFace personaId={msgPersona.id} size="sm" animated={false} />
                              <span>{msgPersona.name}</span>
                            </div>
                          );
                        })()}
                        <div className="hatch-markdown text-[13px] leading-relaxed">
                          <ReactMarkdown
                            components={{
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              p: ({ children }) => <p className="mb-1 text-[13px] leading-relaxed last:mb-0">{children}</p>,
                              li: ({ children }) => (
                                <li className="ml-5 list-disc text-[13px] leading-relaxed">{children}</li>
                              ),
                              ul: ({ children }) => <ul className="my-1 ml-1 space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="my-1 ml-1 list-decimal space-y-1">{children}</ol>,
                              code: ({ children }) => (
                                <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>
                              )
                            }}
                          >
                            {message.content}
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

          {/* QUICK SUGGESTIONS */}
          <div className="flex flex-wrap gap-1 px-4 pb-2">
            {persona.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="rounded-full border border-dashed px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {example}
              </button>
            ))}
          </div>

          {/* INPUT */}
          <div className="border-t bg-slate-50/60 px-4 py-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={persona.placeholder}
                rows={2}
                className="min-h-[46px] max-h-[110px] resize-none text-[13px]"
              />
              <Button 
                type="button" 
                size="sm" 
                disabled={!input.trim() || isSending} 
                onClick={handleSend}
                className="transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
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
            <p className="mt-2 text-[10px] text-muted-foreground">Press Enter to send · Shift + Enter for a new line.</p>
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
    </div>
  );
}
