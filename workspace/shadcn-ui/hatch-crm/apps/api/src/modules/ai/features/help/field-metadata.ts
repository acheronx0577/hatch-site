import type { FieldMeta } from './contextual-help.types';

export const fieldMetadata: Record<string, FieldMeta> = {
  'broker.profile.mlsProvider': {
    label: 'MLS Provider',
    description: 'Which MLS system/board integration Hatch should use for your organization.',
    whyRequired: 'Hatch uses this to select the correct sync strategy, identifiers, and data mappings for your MLS feed.',
    legalBasis: 'Not a legal requirement; it is required to configure MLS integration correctly.',
    bestPractice: 'Choose the board/system you actively list under. If you have multiple boards, start with the primary one and add others as needed.',
    consequences: 'Selecting the wrong provider can prevent syncing or import the wrong data.',
    format: 'One of the supported provider options (e.g., STELLAR, NABOR, MATRIX, GENERIC).',
    examples: ['STELLAR', 'NABOR'],
    documentationLinks: ['/docs/mls-integration'],
    relatedFields: ['broker.profile.mlsId', 'broker.profile.mlsOfficeCode'],
  },

  'broker.profile.mlsOfficeCode': {
    label: 'MLS Office Code',
    description: 'Your brokerage office identifier used by your MLS.',
    whyRequired: 'Helps Hatch associate listings, roster entries, and office-level data correctly when syncing from the MLS.',
    legalBasis: 'Not a legal requirement; it is an MLS identifier.',
    bestPractice: 'Copy this exactly as shown in your MLS admin portal to avoid mismatches.',
    consequences: 'Incorrect codes can lead to missing or mis-attributed listings/agents.',
    format: 'Varies by MLS (often numeric or short alphanumeric).',
    examples: ['12345', 'ABCD01'],
    documentationLinks: ['/docs/mls-integration'],
    relatedFields: ['broker.profile.mlsProvider', 'broker.profile.mlsId'],
  },

  'broker.profile.mlsId': {
    label: 'MLS ID',
    description: 'Your Multiple Listing Service membership identifier.',
    whyRequired: 'Used for MLS data synchronization so Hatch can pull the correct listings and associate them to your brokerage.',
    legalBasis: 'Typically required by MLS membership agreements and data-feed contracts to identify participants accurately.',
    bestPractice: 'Keep this updated if you change MLS boards or maintain multiple memberships.',
    consequences: 'Incorrect IDs can break listing sync, attribution, and compliance reporting.',
    format: 'Varies by MLS (often alphanumeric).',
    examples: ['MIA-12345', 'SWFL-67890'],
    documentationLinks: ['/docs/mls-integration'],
    relatedFields: ['broker.profile.stateLicense'],
  },

  'broker.profile.stateLicense': {
    label: 'State License Number',
    description: 'Your Florida real estate broker license number.',
    whyRequired: 'Florida advertising and transaction workflows commonly require brokerage licensing details to be present and correct.',
    legalBasis: "FREC Rule 61J2-10.025 (Advertising) — brokers must include required identifiers on advertising and communications when applicable.",
    bestPractice: 'Hatch can automatically include this on generated marketing collateral to reduce compliance risk.',
    consequences: 'Missing/incorrect license numbers can lead to compliance violations and fines.',
    format: 'BK followed by 7 digits (e.g., BK1234567).',
    examples: ['BK1234567'],
    documentationLinks: ['/docs/florida-compliance', 'https://www.myfloridalicense.com'],
    relatedFields: ['broker.profile.mlsId', 'agents.*.licenseNumber'],
  },

  'commission.plan.cap': {
    label: 'Commission Cap',
    description: 'Maximum amount an agent pays to the brokerage before their split changes.',
    whyRequired: 'Optional, but commonly used to reward production and simplify forecasting once an agent “caps.”',
    legalBasis: 'Not a legal requirement; it is a business policy.',
    bestPractice: 'Define cap period (monthly/annual/lifetime) and what counts toward it (gross, net, after fees).',
    consequences: 'Ambiguous caps create disputes and manual reconciliation.',
    format: 'Currency amount with period (e.g., $15,000 annual cap).',
    examples: ['$15,000 annual cap', '$12,000 cap then 90/10 split'],
    documentationLinks: [],
    relatedFields: ['commission.plan.preCap', 'commission.plan.postCap'],
  },

  'listing.disclosure.floodZone': {
    label: 'Flood Zone Disclosure',
    description: 'Whether the property is in a FEMA-designated flood zone.',
    whyRequired: 'Often required for accurate disclosures and buyer expectations, and can impact insurance and financing.',
    legalBasis: 'Florida Statute 689.261 — flood disclosure requirements for certain residential properties.',
    bestPractice: 'Verify via FEMA maps; keep a record of the source used.',
    consequences: 'Non-disclosure can create legal liability and jeopardize transactions.',
    format: 'Boolean (Yes/No) plus notes/source when available.',
    examples: ['Yes (FEMA Zone AE)', 'No (per FEMA map)'],
    documentationLinks: ['/docs/flood-disclosure', 'https://msc.fema.gov/portal/home'],
    relatedFields: ['listing.disclosure.hoa', 'listing.disclosure.specialAssessments'],
  },

  'transaction.escrow.depositDeadline': {
    label: 'Escrow Deposit Deadline',
    description: 'Date/time by which earnest money must be deposited.',
    whyRequired: 'Deadlines are contractual; missing them can trigger default or termination rights.',
    legalBasis: 'Contract terms (e.g., FAR/BAR) and general Florida contract law.',
    bestPractice: 'Set reminders; Hatch can send deadline alerts to all parties.',
    consequences: 'Late deposits can be grounds for termination and disputes.',
    format: 'ISO date/time or date with time-zone.',
    examples: ['2026-01-12', '2026-01-12T17:00:00-05:00'],
    documentationLinks: [],
    relatedFields: ['transaction.escrow.depositAmount', 'transaction.timeline.contractDate'],
  },

  'agent.license.expirationDate': {
    label: 'License Expiration Date',
    description: "When the agent's real estate license expires.",
    whyRequired: 'Agents cannot legally practice with an expired license, and brokerages are responsible for supervision.',
    legalBasis: 'Florida Statute 475 — licensing requirements and supervision obligations.',
    bestPractice: 'Track renewal windows and require CE completion proof before expiry.',
    consequences: 'Unlicensed activity can lead to fines, license discipline, and transaction issues.',
    format: 'Date (YYYY-MM-DD).',
    examples: ['2026-09-30'],
    documentationLinks: ['https://www.myfloridalicense.com'],
    relatedFields: ['agents.*.licenseNumber'],
  },

  'marketing.advertisement.brokerageName': {
    label: 'Brokerage Name in Advertising',
    description: 'The registered brokerage name that must appear on all advertising.',
    whyRequired: 'Regulators require brokerage identity to be clear in advertising to prevent consumer confusion.',
    legalBasis: "FREC Rule 61J2-10.025 — brokerage name must be at least as prominent as agent or team name.",
    bestPractice: 'Standardize the displayed name and apply it automatically to all generated assets.',
    consequences: 'Violations can result in fines and license discipline.',
    format: 'Exact registered legal/trade name.',
    examples: ['Sunshine Realty Group, LLC'],
    documentationLinks: ['/docs/florida-compliance'],
    relatedFields: ['broker.profile.stateLicense'],
  },

  'broker.profile.mlsBoardName': {
    label: 'MLS Board Name',
    description: 'The name of your local MLS board or association.',
    whyRequired: 'Used for recordkeeping, support, and to help validate that the correct MLS settings are configured.',
    legalBasis: 'Not a legal requirement; informational and operational.',
    bestPractice: 'Use the official board name as shown in your MLS documentation.',
    consequences: 'If incorrect, it can slow down support or troubleshooting.',
    format: 'Text.',
    examples: ['Stellar MLS', 'Naples Area Board of REALTORS®'],
    documentationLinks: ['/docs/mls-integration'],
    relatedFields: ['broker.profile.mlsBoardUrl', 'broker.profile.mlsProvider'],
  },

  'broker.profile.mlsBoardUrl': {
    label: 'MLS Board URL',
    description: 'A link to your MLS board portal or public site.',
    whyRequired: 'Helps your team find the right place to verify identifiers and membership details, and assists Hatch support in troubleshooting.',
    legalBasis: 'Not a legal requirement; informational.',
    bestPractice: 'Use the official board portal URL (prefer HTTPS).',
    consequences: 'If incorrect, users may be directed to the wrong portal.',
    format: 'URL (https://...).',
    examples: ['https://www.stellarmls.com', 'https://nabor.com'],
    documentationLinks: ['/docs/mls-integration'],
    relatedFields: ['broker.profile.mlsBoardName', 'broker.profile.mlsProvider'],
  },
};

export function matchFieldMetadata(fieldPath: string): { key: string; meta: FieldMeta } | null {
  const normalized = (fieldPath ?? '').trim();
  if (!normalized) return null;

  const direct = fieldMetadata[normalized];
  if (direct) {
    return { key: normalized, meta: direct };
  }

  const candidates: Array<{ key: string; meta: FieldMeta; wildcardCount: number; segments: number }> = [];

  const pathSegments = normalized.split('.').filter(Boolean);
  for (const [key, meta] of Object.entries(fieldMetadata)) {
    if (!key.includes('*')) continue;

    const keySegments = key.split('.').filter(Boolean);
    if (keySegments.length !== pathSegments.length) continue;

    let ok = true;
    let wildcardCount = 0;

    for (let i = 0; i < keySegments.length; i += 1) {
      const segment = keySegments[i];
      if (segment === '*') {
        wildcardCount += 1;
        continue;
      }
      if (segment !== pathSegments[i]) {
        ok = false;
        break;
      }
    }

    if (ok) {
      candidates.push({ key, meta, wildcardCount, segments: keySegments.length });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.wildcardCount !== b.wildcardCount) return a.wildcardCount - b.wildcardCount;
    return b.segments - a.segments;
  });

  const best = candidates[0];
  return { key: best.key, meta: best.meta };
}
