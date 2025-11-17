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
  /** Soft accent color for backgrounds, glows, etc. */
  accentColor: string;
  avatarBg: string;
  avatarEmoji: string;
  tagline: string;
  placeholder: string;
  examples: string[];
  specialty: string;
};

// Simple color palette map for faces and accents
export const PERSONA_COLORS: Record<
  PersonaId,
  { color: string; accent: string }
> = {
  agent_copilot: {
    color: '#1F5FFF',
    accent: '#D9E3FF'
  },
  lead_nurse: {
    color: '#00B894',
    accent: '#D3F7EC'
  },
  listing_concierge: {
    color: '#9B5BFF',
    accent: '#E4D7FF'
  },
  market_analyst: {
    color: '#FF9F43',
    accent: '#FFE3C4'
  },
  transaction_coordinator: {
    color: '#F368E0',
    accent: '#FFD5F6'
  }
};

export const PERSONAS: PersonaConfig[] = [
  {
    id: 'agent_copilot',
    name: 'Echo',
    shortName: 'Echo',
    color: '#1F5FFF',
    accentColor: PERSONA_COLORS.agent_copilot.accent,
    avatarBg: 'rgba(31,95,255,0.12)',
    avatarEmoji: '🧠',
    tagline: 'Daily briefings & next best actions',
    placeholder: 'Ask Echo to summarize your day, prioritize leads, or plan what to do next…',
    examples: ['Echo, help prioritize my leads', 'Echo, summarize my new leads today', 'Echo, which sellers need attention this week?'],
    specialty: 'High-level overview of your book of business, prioritization, and daily planning.'
  },
  {
    id: 'lead_nurse',
    name: 'Lumen',
    shortName: 'Lumen',
    color: '#00B894',
    accentColor: PERSONA_COLORS.lead_nurse.accent,
    avatarBg: 'rgba(0,184,148,0.12)',
    avatarEmoji: '✨',
    tagline: 'Warm outreach & follow-up nurturing',
    placeholder: 'Ask Lumen to write follow-ups, check-in texts, or nurture campaigns…',
    examples: ['Lumen, draft a warm follow-up', 'Lumen, write a check-in text', 'Lumen, create a nurturing sequence'],
    specialty: 'Nurturing sequences, relationship-driven communication, and outreach messages.'
  },
  {
    id: 'listing_concierge',
    name: 'Haven',
    shortName: 'Haven',
    color: '#9B5BFF',
    accentColor: PERSONA_COLORS.listing_concierge.accent,
    avatarBg: 'rgba(155,91,255,0.12)',
    avatarEmoji: '🏡',
    tagline: 'Listing descriptions & marketing copy',
    placeholder: 'Ask Haven to write listing descriptions or highlight key features…',
    examples: ['Haven, write a listing description', 'Haven, rewrite this to sound luxury', 'Haven, highlight features for social media'],
    specialty: 'Listing descriptions, marketing remarks, and property-focused copywriting.'
  },
  {
    id: 'market_analyst',
    name: 'Atlas',
    shortName: 'Atlas',
    color: '#FF9F43',
    accentColor: PERSONA_COLORS.market_analyst.accent,
    avatarBg: 'rgba(255,159,67,0.12)',
    avatarEmoji: '📊',
    tagline: 'Local trends & pricing insight',
    placeholder: 'Ask Atlas about pricing, comps, or what’s happening in your market…',
    examples: ['Atlas, is this listing overpriced?', 'Atlas, summarize price trends', 'Atlas, give me seller talking points'],
    specialty: 'Explaining trends, comps, pricing context, and economic reasoning.'
  },
  {
    id: 'transaction_coordinator',
    name: 'Nova',
    shortName: 'Nova',
    color: '#F368E0',
    accentColor: PERSONA_COLORS.transaction_coordinator.accent,
    avatarBg: 'rgba(243,104,224,0.12)',
    avatarEmoji: '📑',
    tagline: 'Contract dates, milestones & checklists',
    placeholder: 'Ask Nova about key dates, contingencies, or deal steps…',
    examples: ['Nova, summarize the key dates for 123 Main St', 'Nova, what contingencies are open?', 'Nova, create a closing checklist'],
    specialty: 'Tracking contract dates, contingencies, and transaction milestones so nothing falls through the cracks.'
  }
];

export function getPersonaConfigById(id: string | null | undefined): PersonaConfig | undefined {
  if (!id) return undefined;
  return PERSONAS.find((persona) => persona.id === id);
}

export function getPersonaConfig(id: PersonaId): PersonaConfig {
  const match = PERSONAS.find((p) => p.id === id);
  if (!match) throw new Error(`Unknown persona id: ${id}`);
  return match;
}
