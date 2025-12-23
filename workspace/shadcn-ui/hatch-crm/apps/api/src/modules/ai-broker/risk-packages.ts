export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskSignal = {
  source: string;
  code: string;
  severity: RiskSeverity;
  description?: string;
  category?: string;
  ttlHours?: number;
  detectedAt?: string;
  meta?: Record<string, any>;
};

export type RiskPackageId = string;

export type RiskPackageGroup =
  | 'Agent Lifecycle'
  | 'Transaction Types'
  | 'Compliance Focus'
  | 'Agent Behavior'
  | 'Market-Specific'
  | 'Custom';

export type RiskPackageDefinition = {
  id: RiskPackageId;
  name: string;
  description: string;
  group: RiskPackageGroup;
  signalMultipliers: Record<string, number>;
  categoryCaps?: Record<string, number>;
  categoryDefaultMultiplier?: number;
  categoryMultipliers?: Record<string, number>;
  isCustom?: boolean;
};

export type RiskPackageConfig = {
  activePackageIds: RiskPackageId[];
};

const baseCategoryCap = 40;
const totalScoreCap = 100;

const pointsBySeverity: Record<RiskSeverity, number> = {
  LOW: 5,
  MEDIUM: 15,
  HIGH: 30
};

const severityOrder: Record<RiskSeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export const RISK_PACKAGES: RiskPackageDefinition[] = [
  {
    id: 'audit_ready',
    name: 'Audit Ready',
    description: 'Emphasizes license, CE, and membership health for audits.',
    group: 'Compliance Focus',
    signalMultipliers: {
      'LICENSE:LICENSE_EXPIRED': 3.5,
      'LICENSE:LICENSE_EXPIRING_SOON': 2.5,
      'LICENSE:LICENSE_PENDING': 2.0,
      'LICENSE:LICENSE_SUSPENDED': 4.0,
      'CE:CE_HOURS_INCOMPLETE': 3.0,
      'CE:CE_DEADLINE_APPROACHING': 2.0,
      'MEMBERSHIP:MEMBERSHIP_EXPIRED': 2.5,
      'MEMBERSHIP:MEMBERSHIP_EXPIRING_SOON': 1.5,
      'MEMBERSHIP:MEMBERSHIP_PENDING': 2.0
    },
    categoryCaps: {
      LICENSE: 60,
      CE: 50,
      MEMBERSHIP: 50
    }
  },
  {
    id: 'training_focus',
    name: 'Training Focus',
    description: 'Prioritizes required training completion alongside CE progress.',
    group: 'Compliance Focus',
    signalMultipliers: {
      'TRAINING:REQUIRED_TRAINING_INCOMPLETE': 3.25,
      'CE:CE_HOURS_INCOMPLETE': 2.5,
      'AGENT_COMPLIANCE:ACTION_REQUIRED': 1.5
    },
    categoryCaps: {
      TRAINING: 65,
      CE: 55
    }
  },
  {
    id: 'action_required_first',
    name: 'Action Required First',
    description: 'Surfaces agents needing broker intervention today.',
    group: 'Agent Lifecycle',
    signalMultipliers: {
      'AGENT_COMPLIANCE:ACTION_REQUIRED': 3.5,
      'AGENT_COMPLIANCE:NON_COMPLIANT': 2.5,
      'AGENT_COMPLIANCE:REVIEW_NEEDED': 2.0,
      'WORKFLOW:OPEN_COMPLIANCE_TASKS': 2.5,
      'WORKFLOW:OVERDUE_TASKS': 3.0,
      'TRANSACTION:OPEN_COMPLIANCE_ISSUES': 2.0
    },
    categoryCaps: {
      AGENT_COMPLIANCE: 70,
      WORKFLOW: 55
    }
  },
  {
    id: 'document_hygiene',
    name: 'Document Hygiene',
    description: 'Prioritizes missing, pending, or failed documents.',
    group: 'Compliance Focus',
    signalMultipliers: {
      'DOCUMENTS:DOCS_PENDING_OR_FAILED': 3.0,
      'DOCUMENTS:DOCS_MISSING': 3.5,
      'DOCUMENTS:DOCS_EXPIRED': 2.5,
      'DOCUMENTS:SIGNATURE_PENDING': 2.0,
      'TRANSACTION:OPEN_COMPLIANCE_ISSUES': 2.0,
      'TRANSACTION:MISSING_REQUIRED_DOCS': 3.0
    },
    categoryCaps: {
      DOCUMENTS: 65,
      TRANSACTION: 50
    }
  },
  {
    id: 'deadline_ops_enforcer',
    name: 'Deadline / Ops Enforcer',
    description: 'Emphasizes backlog, overdue tasks, and time-sensitive risks.',
    group: 'Agent Behavior',
    signalMultipliers: {
      'WORKFLOW:OPEN_COMPLIANCE_TASKS': 3.0,
      'WORKFLOW:OVERDUE_TASKS': 3.5,
      'WORKFLOW:TASKS_DUE_SOON': 2.0,
      'TRANSACTION:OPEN_COMPLIANCE_ISSUES': 2.5,
      'TRANSACTION:DEADLINE_APPROACHING': 2.5,
      'TRANSACTION:DEADLINE_MISSED': 3.5
    },
    categoryCaps: {
      WORKFLOW: 65,
      TRANSACTION: 55
    }
  },
  {
    id: 'ai_risk_focus',
    name: 'AI Risk Focus',
    description: 'Leans into Copilot evaluations by amplifying AI-driven risk signals.',
    group: 'Compliance Focus',
    signalMultipliers: {
      'AI:AI_COMPLIANCE': 3.0,
      'AI:AI_DOCUMENT_REVIEW': 2.5,
      'AI:AI_RISK_FLAG': 3.0,
      'AI:AI_ANOMALY_DETECTED': 2.5
    },
    categoryCaps: {
      AI: 80
    },
    categoryDefaultMultiplier: 0.7,
    categoryMultipliers: {
      AI: 1.0
    }
  },
  {
    id: 'realtor_standards',
    name: 'Realtor Standards',
    description: 'Tracks MLS and association compliance (membership access and standing).',
    group: 'Compliance Focus',
    signalMultipliers: {
      'MEMBERSHIP:MEMBERSHIP_EXPIRED': 3.5,
      'MEMBERSHIP:MEMBERSHIP_PENDING': 2.5,
      'MEMBERSHIP:MEMBERSHIP_EXPIRING_SOON': 2.0,
      'MEMBERSHIP:DUES_UNPAID': 2.5,
      'MEMBERSHIP:BOARD_SUSPENSION': 4.0,
      'MEMBERSHIP:MLS_ACCESS_REVOKED': 4.0
    },
    categoryCaps: {
      MEMBERSHIP: 70
    }
  }
];

export const normalizeRiskPackageIds = (value: unknown): RiskPackageId[] => {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((id): id is RiskPackageId => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
};

const parseSignalPattern = (pattern: string) => {
  const [rawSource, rawCode] = pattern.split(':', 2);
  return {
    source: rawSource?.trim() || '*',
    code: rawCode?.trim() || '*'
  };
};

const signalMatchesPattern = (signal: RiskSignal, pattern: string) => {
  const parsed = parseSignalPattern(pattern);
  const sourceMatches = parsed.source === '*' || parsed.source === signal.source;
  const codeMatches = parsed.code === '*' || parsed.code === signal.code;
  return sourceMatches && codeMatches;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveSignalMultiplier = (multipliers: number[]) => {
  const boosts = multipliers.filter((m) => typeof m === 'number' && m > 1);
  if (boosts.length === 0) return 1;
  const maxBoost = Math.max(...boosts);
  const bonus = 0.25 * Math.max(0, boosts.length - 1);
  return clamp(maxBoost + bonus, 1, 4);
};

const resolveCategoryCap = (category: string, activePackages: RiskPackageDefinition[]) => {
  const overrides = activePackages
    .map((pkg) => pkg.categoryCaps?.[category])
    .filter((cap): cap is number => typeof cap === 'number' && cap > 0);
  return overrides.length ? Math.max(baseCategoryCap, ...overrides) : baseCategoryCap;
};

const resolveCategoryMultiplier = (category: string, activePackages: RiskPackageDefinition[]) => {
  const explicit = activePackages
    .map((pkg) => pkg.categoryMultipliers?.[category])
    .filter((mult): mult is number => typeof mult === 'number');
  const defaults = activePackages
    .map((pkg) => pkg.categoryDefaultMultiplier)
    .filter((mult): mult is number => typeof mult === 'number');

  const candidates: number[] = [];
  if (defaults.length) {
    candidates.push(Math.min(...defaults));
  }
  if (explicit.length) {
    candidates.push(...explicit);
  }

  if (!candidates.length) return 1;
  const suppressions = candidates.filter((m) => m > 0 && m < 1);
  if (suppressions.length) return Math.min(...suppressions);
  const boosts = candidates.filter((m) => m > 1);
  return boosts.length ? Math.max(...boosts) : 1;
};

export type RiskScoreResult = {
  score: number;
  level: RiskSeverity;
  reasons: Array<{ code: string; source: string; severity: RiskSeverity; description?: string }>;
  signals: RiskSignal[];
};

export function computeRiskScore(
  signals: RiskSignal[],
  config: RiskPackageConfig,
  now = new Date(),
  availablePackages: RiskPackageDefinition[] = RISK_PACKAGES
): RiskScoreResult {
  const activePackages = availablePackages.filter((pkg) => config.activePackageIds.includes(pkg.id));

  const effectiveSignals = signals.filter((signal) => {
    if (!signal.ttlHours) return true;
    const detectedAt = signal.detectedAt ? new Date(signal.detectedAt) : now;
    const expiresAt = detectedAt.getTime() + signal.ttlHours * 60 * 60 * 1000;
    return expiresAt >= now.getTime();
  });

  const categoryCaps = new Map<string, number>();
  const categoryTotals = new Map<string, number>();

  const entries: Array<{ signal: RiskSignal; categoryKey: string; pointsAdded: number }> = [];
  let remaining = totalScoreCap;

  for (const signal of effectiveSignals) {
    const categoryKey = (signal.category ?? signal.source).toUpperCase();
    const cap = categoryCaps.get(categoryKey) ?? resolveCategoryCap(categoryKey, activePackages);
    categoryCaps.set(categoryKey, cap);

    const already = categoryTotals.get(categoryKey) ?? 0;
    const available = Math.max(0, cap - already);

    const basePoints = pointsBySeverity[signal.severity] ?? 0;
    const matchedPackages = activePackages.filter((pkg) =>
      Object.keys(pkg.signalMultipliers).some((pattern) => signalMatchesPattern(signal, pattern))
    );
    const matchedMultipliers = matchedPackages.flatMap((pkg) =>
      Object.entries(pkg.signalMultipliers)
        .filter(([pattern]) => signalMatchesPattern(signal, pattern))
        .map(([, multiplier]) => multiplier)
    );
    const signalMultiplier = resolveSignalMultiplier(matchedMultipliers);
    const weightedPoints = Math.round(basePoints * signalMultiplier);
    const pointsBeforeCategoryMultiplier = Math.min(weightedPoints, available);

    if (pointsBeforeCategoryMultiplier > 0) {
      categoryTotals.set(categoryKey, already + pointsBeforeCategoryMultiplier);
    }

    const categoryMultiplier = resolveCategoryMultiplier(categoryKey, activePackages);
    const pointsAfterCategoryMultiplier = Math.round(pointsBeforeCategoryMultiplier * categoryMultiplier);
    const pointsAdded = Math.min(pointsAfterCategoryMultiplier, remaining);

    remaining = Math.max(0, remaining - pointsAdded);

    const nextSignal: RiskSignal = {
      ...signal,
      meta: {
        ...(signal.meta ?? {}),
        categoryKey,
        basePoints,
        categoryCap: cap,
        categoryMultiplier,
        signalMultiplier,
        pointsBeforeCategoryMultiplier,
        pointsAfterCategoryMultiplier,
        pointsAdded,
        matchedPackageIds: matchedPackages.map((pkg) => pkg.id)
      }
    };

    entries.push({ signal: nextSignal, categoryKey, pointsAdded });

    if (remaining <= 0) break;
  }

  const score = clamp(totalScoreCap - remaining, 0, totalScoreCap);
  const level: RiskSeverity = score >= 70 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';

  const reasons = entries
    .slice()
    .sort((a, b) => (b.pointsAdded || 0) - (a.pointsAdded || 0) || severityOrder[b.signal.severity] - severityOrder[a.signal.severity])
    .slice(0, 5)
    .map(({ signal }) => ({
      code: signal.code,
      source: signal.source,
      severity: signal.severity,
      description: signal.description
    }));

  return { score, level, reasons, signals: entries.map((entry) => entry.signal) };
}
