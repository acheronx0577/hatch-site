export type PersonaId =
  | 'agent_copilot'
  | 'lead_nurse'
  | 'listing_concierge'
  | 'market_analyst'
  | 'transaction_coordinator';

export type PersonaConfig = {
  id: PersonaId;
  name: string;
  shortName: string;
  color: string;
  avatarBg: string;
  avatarEmoji: string;
  tagline: string;
  placeholder: string;
  examples: string[];
  specialty: string;
};

export type PersonaChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  /** Which AI persona authored this message (for assistant messages). */
  personaId?: PersonaId;
};

export type PersonaMemoryLog = {
  personaId: PersonaId;
  label: string;
};

export type PersonaChatResponse = {
  activePersonaId: PersonaId;
  reason?: string | null;
  messages: PersonaChatMessage[];
  memoryLog?: PersonaMemoryLog | null;
};
