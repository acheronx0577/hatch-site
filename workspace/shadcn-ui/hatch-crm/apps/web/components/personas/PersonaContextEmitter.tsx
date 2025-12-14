'use client';

import { useEffect } from 'react';

import { emitPersonaContext, type PersonaContext } from '@/lib/personas/events';

type Props = {
  context: PersonaContext;
};

export function PersonaContextEmitter({ context }: Props) {
  useEffect(() => {
    emitPersonaContext(context);
  }, [context]);

  return null;
}
