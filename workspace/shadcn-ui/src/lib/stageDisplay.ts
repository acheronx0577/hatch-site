export interface StageDisplay {
  short: string;
  long: string | null;
}

const DEFAULT_STAGE_DISPLAY: Record<string, StageDisplay> = {
  S1: { short: 'S1', long: 'New Lead / Inquiry' },
  S2: { short: 'S2', long: 'Contacted' },
  S3: { short: 'S3', long: 'Engaged' },
  S4: { short: 'S4', long: 'Qualified' },
  S5: { short: 'S5', long: 'Appointment Set' },
  S6: { short: 'S6', long: 'Showing / Demo' },
  S7: { short: 'S7', long: 'Offer Made' },
  S8: { short: 'S8', long: 'Negotiation' },
  S9: { short: 'S9', long: 'Under Contract' },
  S10: { short: 'S10', long: 'Closed / Won' }
};

export function getStageDisplay(stageName?: string | null): StageDisplay {
  if (!stageName) {
    return { short: 'Unassigned', long: null };
  }

  const trimmed = stageName.trim();
  if (DEFAULT_STAGE_DISPLAY[trimmed]) {
    return DEFAULT_STAGE_DISPLAY[trimmed];
  }

  const codeMatch = trimmed.match(/^S\d+/i);
  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    const remainder = trimmed.slice(codeMatch[0].length).replace(/^[\s–—\-\/|.]+/, '').trim();
    const mapped = DEFAULT_STAGE_DISPLAY[code];
    if (remainder) {
      return { short: code, long: remainder };
    }
    if (mapped) {
      return mapped;
    }
    return { short: code, long: null };
  }

  return { short: trimmed, long: null };
}
