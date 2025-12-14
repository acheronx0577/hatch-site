"use client";

import { PERSONAS, type PersonaId } from '@/lib/ai/aiPersonas';
import { AiPersonaFace } from '@/components/ai/AiPersonaFace';
import { cn } from '@/lib/utils';

type PersonaSelectorProps = {
  activeId: PersonaId | null;
  onSelect: (id: PersonaId) => void;
  statuses?: Partial<Record<PersonaId, 'ready' | 'provisioning'>>;
};

export function PersonaSelector({ activeId, onSelect, statuses }: PersonaSelectorProps) {
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto pb-2 pr-1">
      {PERSONAS.map((persona) => {
        const isActive = persona.id === activeId;
        const status = statuses?.[persona.id];
        return (
          <button
            key={persona.id}
            type="button"
            onClick={() => onSelect(persona.id)}
            className={cn(
              'flex min-w-[175px] flex-col rounded-2xl border px-3 py-2 text-left transition hover:-translate-y-[1px] hover:shadow-sm',
              isActive ? 'border-transparent' : 'border-border'
            )}
            style={{
              backgroundColor: isActive ? `${persona.color}1A` : '#FFFFFF',
              boxShadow: isActive ? '0 8px 20px rgba(15,23,42,0.15)' : undefined
            }}
          >
            <div className="flex items-center gap-2">
              <AiPersonaFace personaId={persona.id} size="sm" animated active={isActive} />

              <div className="flex flex-col">
                <span className="text-sm font-semibold">{persona.shortName}</span>
                <span className="text-[11px] text-muted-foreground">{persona.tagline}</span>
              </div>
            </div>
            {status && status !== 'ready' && (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Provisioning…</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
