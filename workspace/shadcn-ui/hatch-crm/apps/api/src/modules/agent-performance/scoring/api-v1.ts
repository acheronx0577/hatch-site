import { differenceInCalendarDays } from 'date-fns';

export const API_V1_MODEL_VERSION = 'API_v1' as const;

export type AgentPerformanceConfidenceBand = 'HIGH' | 'MEDIUM' | 'DEVELOPING';

export type AgentPerformanceDimensionKey =
  | 'HISTORICAL_EFFECTIVENESS'
  | 'RESPONSIVENESS_RELIABILITY'
  | 'RECENCY_MOMENTUM'
  | 'OPPORTUNITY_FIT'
  | 'RISK_DRAG'
  | 'CAPACITY_LOAD';

export type AgentPerformanceDriver = {
  label: string;
  direction: 'positive' | 'negative';
  metricSummary: string;
  deepLink?: string;
  dimension?: AgentPerformanceDimensionKey;
};

export type AgentPerformanceWeightsConfig = {
  weightHistoricalEffectiveness: number;
  weightResponsivenessReliability: number;
  weightRecencyMomentum: number;
  weightOpportunityFit: number;
  weightCapacityLoad: number;
  maxRiskDragPenalty: number;
  highBandThreshold: number;
  mediumBandThreshold: number;
};

export const DEFAULT_AGENT_PERFORMANCE_WEIGHTS: AgentPerformanceWeightsConfig = {
  weightHistoricalEffectiveness: 0.25,
  weightResponsivenessReliability: 0.2,
  weightRecencyMomentum: 0.15,
  weightOpportunityFit: 0.15,
  weightCapacityLoad: 0.25,
  maxRiskDragPenalty: 0.25,
  highBandThreshold: 0.75,
  mediumBandThreshold: 0.5
};

export type AgentPerformanceRawFeatures = {
  window: {
    start: string;
    end: string;
    lookbackDays: number;
  };
  fitBaseline?: {
    windowDays: number;
    typicalLeadType: 'BUYER' | 'SELLER' | 'UNKNOWN';
    topState: string | null;
    topPropertyType: string | null;
    topPriceBand: 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY' | null;
    listingsTotal: number;
    listingsInTopState: number;
    listingsInTopPropertyType: number;
    closedTotal: number;
    closedInTopPriceBand: number;
    score: number;
  };
  tenureDays: number;
  leads: {
    worked: number;
    converted: number;
    closeRate: number;
    newLast30Days: number;
    staleNewLast30Days: number;
  };
  tasks: {
    completedLast30Days: number;
    completedPrev30Days: number;
    overdueOpen: number;
  };
  transactions: {
    closedLast30Days: number;
    closedLast90Days: number;
    closedPrev90Days: number;
    avgDaysToClose: number | null;
    active: number;
    quality: {
      windowDays: number;
      closedTotal: number;
      closedFlagged: number;
      compliantRate: number | null;
    };
  };
  listings: {
    active: number;
  };
  sla: {
    resolvedLast30Days: number;
    satisfiedLast30Days: number;
    breachedLast30Days: number;
    adherenceRate: number | null;
    medianFirstTouchMinutes: number | null;
    p90FirstTouchMinutes: number | null;
  };
  activity: {
    touchesLast30Days: number;
    touchesPrev30Days: number;
  };
  risk: {
    riskLevel: string;
    requiresAction: boolean;
    nonCompliantTransactions: number;
    oldestNonCompliantDays: number | null;
    interventionsLast30Days: number;
  };
  capacity: {
    activeLoad: number;
    activeListings: number;
    activeTransactions: number;
    openLeads: number;
    overdueOpenTasks: number;
    firstTouchBreachesLast30Days: number;
  };
};

export type AgentPerformanceDimensions = {
  historicalEffectiveness: number;
  responsivenessReliability: number;
  recencyMomentum: number;
  opportunityFit: number;
  riskDragPenalty: number;
  capacityLoad: number;
};

export type AgentPerformanceIndicator = {
  modelVersion: typeof API_V1_MODEL_VERSION;
  overallScore: number;
  confidenceBand: AgentPerformanceConfidenceBand;
  dimensions: AgentPerformanceDimensions;
  topDrivers: AgentPerformanceDriver[];
  rawFeatureSummary: AgentPerformanceRawFeatures;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

const round = (value: number, decimals = 3) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const scoreMedianFirstTouch = (medianMinutes: number | null) => {
  if (medianMinutes === null) return 0.65;
  if (medianMinutes <= 15) return 1;
  if (medianMinutes <= 30) return 0.9;
  if (medianMinutes <= 60) return 0.8;
  if (medianMinutes <= 120) return 0.65;
  if (medianMinutes <= 240) return 0.5;
  return 0.35;
};

const scoreCloseRate = (rate: number) => clamp01(rate / 0.35);

const scoreAvgDaysToClose = (avgDays: number | null) => {
  if (avgDays === null) return 0.7;
  const score = 1 - ((avgDays - 30) / 60) * 0.8;
  return clamp(score, 0.2, 1);
};

const scoreVolumePer90Days = (closesPer90: number) => clamp01(closesPer90 / 6);

const scoreAbandonment = (staleNew: number, newLeads: number) => {
  if (newLeads <= 0) return 0.7;
  const rate = staleNew / newLeads;
  return clamp01(1 - rate / 0.4);
};

const scoreMomentum = (closed30: number, closedPrev90: number) => {
  if (closedPrev90 > 0) {
    const expected30 = closedPrev90 / 3;
    const ratio = expected30 > 0 ? closed30 / expected30 : closed30;
    if (ratio >= 1.2) return 1;
    if (ratio >= 1) return 0.85;
    if (ratio >= 0.8) return 0.7;
    if (ratio >= 0.5) return 0.5;
    return 0.35;
  }

  return clamp(0.35 + clamp01(closed30 / 3) * 0.65, 0.35, 1);
};

const scoreActivityDelta = (current: number, previous: number) => {
  const prev = Math.max(previous, 1);
  const delta = (current - previous) / prev;
  if (delta >= 0.25) return 1;
  if (delta >= 0.1) return 0.85;
  if (delta >= -0.1) return 0.7;
  if (delta >= -0.25) return 0.55;
  return 0.4;
};

const toConfidenceBand = (
  overallScore: number,
  thresholds: Pick<AgentPerformanceWeightsConfig, 'highBandThreshold' | 'mediumBandThreshold'>
): AgentPerformanceConfidenceBand => {
  if (overallScore >= thresholds.highBandThreshold) return 'HIGH';
  if (overallScore >= thresholds.mediumBandThreshold) return 'MEDIUM';
  return 'DEVELOPING';
};

const normalizeWeights = (weights: AgentPerformanceWeightsConfig) => {
  const sum =
    weights.weightHistoricalEffectiveness +
    weights.weightResponsivenessReliability +
    weights.weightRecencyMomentum +
    weights.weightOpportunityFit +
    weights.weightCapacityLoad;

  if (!Number.isFinite(sum) || sum <= 0) {
    return {
      ...DEFAULT_AGENT_PERFORMANCE_WEIGHTS
    };
  }

  return {
    ...weights,
    weightHistoricalEffectiveness: weights.weightHistoricalEffectiveness / sum,
    weightResponsivenessReliability: weights.weightResponsivenessReliability / sum,
    weightRecencyMomentum: weights.weightRecencyMomentum / sum,
    weightOpportunityFit: weights.weightOpportunityFit / sum,
    weightCapacityLoad: weights.weightCapacityLoad / sum
  };
};

export function computeApiV1Indicator(params: {
  orgId: string;
  agentProfileId: string;
  agentUserId?: string;
  now: Date;
  lookbackStart: Date;
  agentCreatedAt: Date;
  weights: AgentPerformanceWeightsConfig;
  riskLevel: string;
  requiresAction: boolean;
  opportunityFitBaseline?: {
    windowDays: number;
    context: {
      typicalLeadType: 'BUYER' | 'SELLER' | 'UNKNOWN';
      topState: string | null;
      topPropertyType: string | null;
      topPriceBand: 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY' | null;
    };
    counts: {
      listingsTotal: number;
      listingsInTopState: number;
      listingsInTopPropertyType: number;
      closedTotal: number;
      closedInTopPriceBand: number;
    };
  };
  leadsWorked: number;
  leadsConverted: number;
  leadsNewLast30Days: number;
  leadsStaleNewLast30Days: number;
  openLeads: number;
  tasksCompletedLast30Days: number;
  tasksCompletedPrev30Days: number;
  overdueOpenTasks: number;
  closedTransactionsLast30Days: number;
  closedTransactionsLast90Days: number;
  closedTransactionsPrev90Days: number;
  avgDaysToClose: number | null;
  activeTransactions: number;
  activeListings: number;
  closedTransactionsQualityWindowDays: number;
  closedTransactionsQualityTotal: number;
  closedTransactionsQualityFlagged: number;
  firstTouchResolvedLast30Days: number;
  firstTouchSatisfiedLast30Days: number;
  firstTouchBreachedLast30Days: number;
  firstTouchResponseMinutes: number[];
  touchesLast30Days: number;
  touchesPrev30Days: number;
  nonCompliantTransactions: number;
  oldestNonCompliantUpdatedAt: Date | null;
  interventionsLast30Days: number;
  opportunityFitScore?: number;
}): AgentPerformanceIndicator {
  const weights = normalizeWeights(params.weights);
  const tenureDays = Math.max(differenceInCalendarDays(params.now, params.agentCreatedAt), 0);

  const closeRateSmoothed = (params.leadsConverted + 2) / (params.leadsWorked + 10);
  const recentActivityCount = params.tasksCompletedLast30Days + params.touchesLast30Days;

  const medianFirstTouch = percentile(params.firstTouchResponseMinutes, 0.5);
  const p90FirstTouch = percentile(params.firstTouchResponseMinutes, 0.9);

  const adherence =
    params.firstTouchResolvedLast30Days > 0
      ? params.firstTouchSatisfiedLast30Days / params.firstTouchResolvedLast30Days
      : null;

  const closeRateScore = scoreCloseRate(closeRateSmoothed);
  const daysToCloseScore = scoreAvgDaysToClose(params.avgDaysToClose);

  const windowDaysForRate = clamp(tenureDays, 30, 90);
  const closesPer90 =
    windowDaysForRate > 0 ? (params.closedTransactionsLast90Days / (windowDaysForRate / 90)) : 0;
  const volumeScore = scoreVolumePer90Days(closesPer90);

  const baseHistoricalEffectiveness = clamp01(closeRateScore * 0.5 + daysToCloseScore * 0.2 + volumeScore * 0.3);

  const qualityTotal = Math.max(0, params.closedTransactionsQualityTotal);
  const qualityFlagged = clamp(params.closedTransactionsQualityFlagged, 0, qualityTotal);
  const qualityCompliant = Math.max(0, qualityTotal - qualityFlagged);
  const qualityRate = qualityTotal > 0 ? qualityCompliant / qualityTotal : null;
  const qualityScore = qualityTotal > 0 ? clamp01((qualityCompliant + 1) / (qualityTotal + 4)) : 0.7;
  const qualityWeight = clamp01(qualityTotal / 10) * 0.15;

  const historicalEffectiveness = clamp01(baseHistoricalEffectiveness * (1 - qualityWeight) + qualityScore * qualityWeight);

  const responseSpeed = scoreMedianFirstTouch(medianFirstTouch === null ? null : Number(medianFirstTouch.toFixed(1)));

  const resolved = params.firstTouchResolvedLast30Days;
  const adherenceBaseline = 0.7;
  const adherenceRaw = adherence ?? adherenceBaseline;
  const adherenceSmoothed = (adherenceRaw * resolved + adherenceBaseline * 10) / (resolved + 10);
  const slaScore = clamp01(adherenceSmoothed);

  const reliabilityScore =
    params.tasksCompletedLast30Days + params.overdueOpenTasks > 0
      ? clamp01(1 - params.overdueOpenTasks / 10)
      : 0.7;
  const abandonmentScore = scoreAbandonment(params.leadsStaleNewLast30Days, params.leadsNewLast30Days);

  const responsivenessReliability = clamp01(
    responseSpeed * 0.35 +
      slaScore * 0.35 +
      reliabilityScore * 0.2 +
      abandonmentScore * 0.1
  );

  const momentumScore = scoreMomentum(params.closedTransactionsLast30Days, params.closedTransactionsPrev90Days);
  const activityCompositeCurrent = params.tasksCompletedLast30Days + params.touchesLast30Days / 10;
  const activityCompositePrev = params.tasksCompletedPrev30Days + params.touchesPrev30Days / 10;
  const activityMomentumScore = scoreActivityDelta(activityCompositeCurrent, activityCompositePrev);
  const recencyMomentum = clamp01(momentumScore * 0.6 + activityMomentumScore * 0.4);

  const opportunityFit = clamp01(params.opportunityFitScore ?? 0.7);

  const oldestNonCompliantDays =
    params.oldestNonCompliantUpdatedAt
      ? Math.max(differenceInCalendarDays(params.now, params.oldestNonCompliantUpdatedAt), 0)
      : null;

  const hasAnyRiskSignals =
    params.nonCompliantTransactions > 0 ||
    params.requiresAction ||
    params.interventionsLast30Days > 0 ||
    params.riskLevel !== 'LOW';

  const baseRisk =
    params.riskLevel === 'HIGH' ? 0.12 : params.riskLevel === 'MEDIUM' ? 0.05 : 0;

  const nonCompliantFactor = clamp01(params.nonCompliantTransactions / 5) * 0.08;
  const requiresActionFactor = params.requiresAction ? 0.05 : 0;
  const ageFactor =
    oldestNonCompliantDays === null
      ? 0
      : oldestNonCompliantDays > 30
        ? 0.05
        : oldestNonCompliantDays > 14
          ? 0.03
          : oldestNonCompliantDays > 7
            ? 0.02
            : 0;
  const interventionFactor = clamp01(params.interventionsLast30Days / 5) * 0.04;

  const riskPenaltyMagnitude = hasAnyRiskSignals
    ? clamp(baseRisk + nonCompliantFactor + requiresActionFactor + ageFactor + interventionFactor, 0, weights.maxRiskDragPenalty)
    : 0;
  const riskDragPenalty = -round(riskPenaltyMagnitude, 3);

  const activeLoad = params.activeTransactions + params.activeListings + Math.ceil(params.openLeads / 10);
  const capacityCeiling = 12;
  const baseCapacity = clamp01(1 - activeLoad / capacityCeiling);
  const overduePenalty = clamp01(params.overdueOpenTasks / 10) * 0.3;
  const breachPenalty = clamp01(params.firstTouchBreachedLast30Days / 5) * 0.2;
  const capacityLoad = clamp01(baseCapacity * (1 - overduePenalty) * (1 - breachPenalty));

  const positive =
    historicalEffectiveness * weights.weightHistoricalEffectiveness +
    responsivenessReliability * weights.weightResponsivenessReliability +
    recencyMomentum * weights.weightRecencyMomentum +
    opportunityFit * weights.weightOpportunityFit +
    capacityLoad * weights.weightCapacityLoad;

  let overallScore = clamp01(round(positive + riskDragPenalty, 4));
  let confidenceBand = toConfidenceBand(overallScore, weights);

  const riskSeverity = ['LOW', 'MEDIUM', 'HIGH'].includes(params.riskLevel) ? params.riskLevel : 'ALL';
  const riskSeverityQuery = riskSeverity === 'ALL' ? '' : `&severity=${encodeURIComponent(riskSeverity)}`;

  const deepLinks = {
    agentPerformance: `/broker/agent-performance/${params.agentProfileId}`,
    compliance: `/broker/compliance?agent=${encodeURIComponent(params.agentProfileId)}&domain=COMPLIANCE${riskSeverityQuery}`,
    transactionsRisk: `/broker/compliance?agent=${encodeURIComponent(params.agentProfileId)}&domain=TRANSACTIONS${riskSeverityQuery}`,
    leads: params.agentUserId
      ? `/broker/crm?ownerId=${encodeURIComponent(params.agentUserId)}`
      : `/broker/crm`,
    transactionsClosed: `/broker/transactions?agent=${encodeURIComponent(params.agentProfileId)}&filter=CLOSED`,
    transactionsPipeline: `/broker/transactions?agent=${encodeURIComponent(params.agentProfileId)}&filter=UNDER_CONTRACT`
  };

  const driverCandidates: Array<AgentPerformanceDriver & { importance: number }> = [];

  const insufficientData =
    tenureDays < 45 &&
    params.leadsWorked < 8 &&
    params.firstTouchResolvedLast30Days < 5 &&
    recentActivityCount < 10 &&
    params.closedTransactionsLast90Days + params.closedTransactionsPrev90Days < 1;

  if (insufficientData) {
    const neutralBaseline = clamp01(weights.mediumBandThreshold);
    const blended = neutralBaseline + (overallScore - neutralBaseline) * 0.25;
    overallScore = clamp01(round(blended, 4));

    driverCandidates.push({
      label: 'Insufficient recent data; score blended toward neutral',
      direction: 'negative',
      metricSummary: `${tenureDays}d tenure · ${params.leadsWorked} leads worked · ${params.firstTouchResolvedLast30Days} SLA samples (30d)`,
      deepLink: deepLinks.agentPerformance,
      importance: 10
    });
    confidenceBand = 'DEVELOPING';
  }

  if (historicalEffectiveness >= 0.8) {
    driverCandidates.push({
      label: 'Strong historical effectiveness',
      direction: 'positive',
      metricSummary: `Close rate ${(closeRateSmoothed * 100).toFixed(0)}% · ${params.closedTransactionsLast90Days} closings (90d)`,
      deepLink: deepLinks.transactionsClosed,
      dimension: 'HISTORICAL_EFFECTIVENESS',
      importance: weights.weightHistoricalEffectiveness * historicalEffectiveness
    });
  } else if (historicalEffectiveness <= 0.55) {
    driverCandidates.push({
      label: 'Low historical effectiveness signals',
      direction: 'negative',
      metricSummary: `Close rate ${(closeRateSmoothed * 100).toFixed(0)}% · ${params.closedTransactionsLast90Days} closings (90d)`,
      deepLink: deepLinks.transactionsClosed,
      dimension: 'HISTORICAL_EFFECTIVENESS',
      importance: weights.weightHistoricalEffectiveness * (1 - historicalEffectiveness)
    });
  }

  if (qualityTotal >= 3 && qualityScore >= 0.85) {
    driverCandidates.push({
      label: 'High transaction quality',
      direction: 'positive',
      metricSummary: `${qualityRate === null ? '—' : `${(qualityRate * 100).toFixed(0)}%`} compliant closings · ${qualityTotal} closings (${params.closedTransactionsQualityWindowDays}d)`,
      deepLink: deepLinks.transactionsClosed,
      dimension: 'HISTORICAL_EFFECTIVENESS',
      importance: weights.weightHistoricalEffectiveness * qualityWeight * qualityScore
    });
  } else if (qualityTotal >= 3 && qualityScore <= 0.65) {
    driverCandidates.push({
      label: 'Transaction quality needs attention',
      direction: 'negative',
      metricSummary: `${qualityFlagged}/${qualityTotal} closings flagged · ${qualityRate === null ? '—' : `${(qualityRate * 100).toFixed(0)}%`} compliant (${params.closedTransactionsQualityWindowDays}d)`,
      deepLink: deepLinks.transactionsRisk,
      dimension: 'HISTORICAL_EFFECTIVENESS',
      importance: weights.weightHistoricalEffectiveness * qualityWeight * (1 - qualityScore)
    });
  }

  if (responsivenessReliability >= 0.8) {
    driverCandidates.push({
      label: 'Fast, reliable first-touch',
      direction: 'positive',
      metricSummary: `Median first-touch ${medianFirstTouch ? `${medianFirstTouch.toFixed(0)}m` : '—'} · SLA met ${(slaScore * 100).toFixed(0)}%`,
      deepLink: deepLinks.leads,
      dimension: 'RESPONSIVENESS_RELIABILITY',
      importance: weights.weightResponsivenessReliability * responsivenessReliability
    });
  } else if (responsivenessReliability <= 0.6) {
    driverCandidates.push({
      label: 'Response & SLA consistency needs work',
      direction: 'negative',
      metricSummary: `Median first-touch ${medianFirstTouch ? `${medianFirstTouch.toFixed(0)}m` : '—'} · ${params.firstTouchBreachedLast30Days} SLA breaches (30d)`,
      deepLink: deepLinks.leads,
      dimension: 'RESPONSIVENESS_RELIABILITY',
      importance: weights.weightResponsivenessReliability * (1 - responsivenessReliability)
    });
  }

  if (recencyMomentum >= 0.75) {
    driverCandidates.push({
      label: 'Positive recency & momentum',
      direction: 'positive',
      metricSummary: `${params.closedTransactionsLast30Days} closings (30d) · Activity trending up`,
      deepLink: deepLinks.transactionsClosed,
      dimension: 'RECENCY_MOMENTUM',
      importance: weights.weightRecencyMomentum * recencyMomentum
    });
  } else if (recencyMomentum <= 0.55) {
    driverCandidates.push({
      label: 'Recency & momentum trending down',
      direction: 'negative',
      metricSummary: `${params.closedTransactionsLast30Days} closings (30d) · Activity trending down`,
      deepLink: deepLinks.transactionsClosed,
      dimension: 'RECENCY_MOMENTUM',
      importance: weights.weightRecencyMomentum * (1 - recencyMomentum)
    });
  }

  if (opportunityFit >= 0.8) {
    driverCandidates.push({
      label: 'Strong opportunity fit',
      direction: 'positive',
      metricSummary: (() => {
        const baseline = params.opportunityFitBaseline;
        if (!baseline) return `Baseline fit ${(opportunityFit * 100).toFixed(0)}% · context can increase/decrease`;
        const parts: string[] = [];
        if (baseline.context.topState && baseline.counts.listingsTotal > 0) {
          parts.push(`${baseline.counts.listingsInTopState}/${baseline.counts.listingsTotal} listings in ${baseline.context.topState}`);
        }
        if (baseline.context.topPriceBand && baseline.counts.closedTotal > 0) {
          parts.push(`${baseline.counts.closedInTopPriceBand}/${baseline.counts.closedTotal} closings in ${baseline.context.topPriceBand}`);
        }
        if (baseline.context.topPropertyType && baseline.counts.listingsTotal > 0 && parts.length < 2) {
          parts.push(`${baseline.counts.listingsInTopPropertyType}/${baseline.counts.listingsTotal} listings in ${baseline.context.topPropertyType}`);
        }
        return `Baseline fit ${(opportunityFit * 100).toFixed(0)}% · ${parts.join(' · ') || `Window ${baseline.windowDays}d`}`;
      })(),
      deepLink: deepLinks.agentPerformance,
      dimension: 'OPPORTUNITY_FIT',
      importance: weights.weightOpportunityFit * opportunityFit
    });
  } else if (opportunityFit <= 0.6) {
    driverCandidates.push({
      label: 'Opportunity fit may vary by lead context',
      direction: 'negative',
      metricSummary: (() => {
        const baseline = params.opportunityFitBaseline;
        if (!baseline) return `Baseline fit ${(opportunityFit * 100).toFixed(0)}% · check lead type/geo/price band`;
        const parts: string[] = [];
        if (baseline.context.topState && baseline.counts.listingsTotal > 0) {
          parts.push(`${baseline.counts.listingsInTopState}/${baseline.counts.listingsTotal} listings in ${baseline.context.topState}`);
        }
        if (baseline.context.topPriceBand && baseline.counts.closedTotal > 0) {
          parts.push(`${baseline.counts.closedInTopPriceBand}/${baseline.counts.closedTotal} closings in ${baseline.context.topPriceBand}`);
        }
        return `Baseline fit ${(opportunityFit * 100).toFixed(0)}% · ${parts.join(' · ') || `Window ${baseline.windowDays}d`}`;
      })(),
      deepLink: deepLinks.agentPerformance,
      dimension: 'OPPORTUNITY_FIT',
      importance: weights.weightOpportunityFit * (1 - opportunityFit)
    });
  }

  if (riskDragPenalty <= -0.08) {
    driverCandidates.push({
      label: 'Risk drag from open compliance signals',
      direction: 'negative',
      metricSummary: `${params.nonCompliantTransactions} flagged transactions · ${params.interventionsLast30Days} interventions (30d)`,
      deepLink: deepLinks.transactionsRisk,
      dimension: 'RISK_DRAG',
      importance: Math.abs(riskDragPenalty)
    });
  } else if (riskDragPenalty === 0) {
    driverCandidates.push({
      label: 'Low risk drag',
      direction: 'positive',
      metricSummary: 'No active compliance drag detected',
      deepLink: deepLinks.compliance,
      dimension: 'RISK_DRAG',
      importance: 0.05
    });
  }

  if (capacityLoad >= 0.75) {
    driverCandidates.push({
      label: 'Healthy capacity',
      direction: 'positive',
      metricSummary: `${activeLoad} active load units · ${params.overdueOpenTasks} overdue tasks`,
      deepLink: deepLinks.transactionsPipeline,
      dimension: 'CAPACITY_LOAD',
      importance: weights.weightCapacityLoad * capacityLoad
    });
  } else if (capacityLoad <= 0.5) {
    driverCandidates.push({
      label: 'Capacity constrained',
      direction: 'negative',
      metricSummary: `${activeLoad} active load units · ${params.overdueOpenTasks} overdue tasks`,
      deepLink: deepLinks.transactionsPipeline,
      dimension: 'CAPACITY_LOAD',
      importance: weights.weightCapacityLoad * (1 - capacityLoad)
    });
  }

  const topDrivers = driverCandidates
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 6)
    .map(({ importance: _importance, ...driver }) => driver);

  const rawFeatureSummary: AgentPerformanceRawFeatures = {
    window: {
      start: params.lookbackStart.toISOString(),
      end: params.now.toISOString(),
      lookbackDays: differenceInCalendarDays(params.now, params.lookbackStart)
    },
    fitBaseline: params.opportunityFitBaseline
      ? {
          windowDays: params.opportunityFitBaseline.windowDays,
          typicalLeadType: params.opportunityFitBaseline.context.typicalLeadType,
          topState: params.opportunityFitBaseline.context.topState,
          topPropertyType: params.opportunityFitBaseline.context.topPropertyType,
          topPriceBand: params.opportunityFitBaseline.context.topPriceBand,
          listingsTotal: params.opportunityFitBaseline.counts.listingsTotal,
          listingsInTopState: params.opportunityFitBaseline.counts.listingsInTopState,
          listingsInTopPropertyType: params.opportunityFitBaseline.counts.listingsInTopPropertyType,
          closedTotal: params.opportunityFitBaseline.counts.closedTotal,
          closedInTopPriceBand: params.opportunityFitBaseline.counts.closedInTopPriceBand,
          score: round(opportunityFit, 4)
        }
      : undefined,
    tenureDays,
    leads: {
      worked: params.leadsWorked,
      converted: params.leadsConverted,
      closeRate: round(closeRateSmoothed, 4),
      newLast30Days: params.leadsNewLast30Days,
      staleNewLast30Days: params.leadsStaleNewLast30Days
    },
    tasks: {
      completedLast30Days: params.tasksCompletedLast30Days,
      completedPrev30Days: params.tasksCompletedPrev30Days,
      overdueOpen: params.overdueOpenTasks
    },
    transactions: {
      closedLast30Days: params.closedTransactionsLast30Days,
      closedLast90Days: params.closedTransactionsLast90Days,
      closedPrev90Days: params.closedTransactionsPrev90Days,
      avgDaysToClose: params.avgDaysToClose === null ? null : round(params.avgDaysToClose, 1),
      active: params.activeTransactions,
      quality: {
        windowDays: params.closedTransactionsQualityWindowDays,
        closedTotal: qualityTotal,
        closedFlagged: qualityFlagged,
        compliantRate: qualityRate === null ? null : round(qualityRate, 4)
      }
    },
    listings: {
      active: params.activeListings
    },
    sla: {
      resolvedLast30Days: params.firstTouchResolvedLast30Days,
      satisfiedLast30Days: params.firstTouchSatisfiedLast30Days,
      breachedLast30Days: params.firstTouchBreachedLast30Days,
      adherenceRate: adherence === null ? null : round(adherence, 4),
      medianFirstTouchMinutes: medianFirstTouch === null ? null : round(medianFirstTouch, 1),
      p90FirstTouchMinutes: p90FirstTouch === null ? null : round(p90FirstTouch, 1)
    },
    activity: {
      touchesLast30Days: params.touchesLast30Days,
      touchesPrev30Days: params.touchesPrev30Days
    },
    risk: {
      riskLevel: params.riskLevel,
      requiresAction: params.requiresAction,
      nonCompliantTransactions: params.nonCompliantTransactions,
      oldestNonCompliantDays,
      interventionsLast30Days: params.interventionsLast30Days
    },
    capacity: {
      activeLoad,
      activeListings: params.activeListings,
      activeTransactions: params.activeTransactions,
      openLeads: params.openLeads,
      overdueOpenTasks: params.overdueOpenTasks,
      firstTouchBreachesLast30Days: params.firstTouchBreachedLast30Days
    }
  };

  return {
    modelVersion: API_V1_MODEL_VERSION,
    overallScore,
    confidenceBand,
    dimensions: {
      historicalEffectiveness: round(historicalEffectiveness, 4),
      responsivenessReliability: round(responsivenessReliability, 4),
      recencyMomentum: round(recencyMomentum, 4),
      opportunityFit: round(opportunityFit, 4),
      riskDragPenalty,
      capacityLoad: round(capacityLoad, 4)
    },
    topDrivers,
    rawFeatureSummary
  };
}
