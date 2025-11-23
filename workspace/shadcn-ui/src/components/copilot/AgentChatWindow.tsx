"use client";

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PERSONAS, type PersonaId } from '@/lib/ai/aiPersonas';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

type AgentChatWindowProps = {
  activePersonaId: PersonaId;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  onSend: (text: string) => void;
  isLoading?: boolean;
};

export function AgentChatWindow({ activePersonaId, messages, input, setInput, onSend, isLoading = false }: AgentChatWindowProps) {
  const persona = React.useMemo(() => PERSONAS.find((p) => p.id === activePersonaId) ?? PERSONAS[0], [activePersonaId]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
  };

  return (
    <div className="flex flex-1 flex-col rounded-2xl border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{persona?.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {persona?.tagline} · {persona?.specialty}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Ask {persona?.shortName ?? 'this AI'} to help with {persona?.specialty?.toLowerCase()}.
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <span
                className={`inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                {message.content}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="border-t px-4 py-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={persona?.placeholder}
          className="min-h-[48px] resize-none"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <p>Try asking {persona?.shortName}:</p>
          <div className="flex flex-wrap gap-1">
            {(persona?.examples ?? []).map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full border px-2 py-0.5 hover:bg-muted"
                onClick={() => setInput(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button 
            size="sm" 
            disabled={!input.trim() || isLoading} 
            onClick={handleSend}
            className="transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
            aria-busy={isLoading}
            aria-live="polite"
          >
            {isLoading ? (
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
      </div>
    </div>
  );
}
