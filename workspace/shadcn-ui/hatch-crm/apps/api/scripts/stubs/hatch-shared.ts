const noopObject = Object.freeze({});

const createSchema = () => {
  const schema: any = {};
  schema.parse = () => ({});
  schema.array = () => schema;
  schema.optional = () => schema;
  schema.nullable = () => schema;
  schema.default = () => schema;
  return schema;
};

const stubFunction = (..._args: any[]): any => ({});

export class DomainEvent {
  constructor(public payload: unknown) {}
}

export const makeDomainEvent = stubFunction;
export const signPayload = (_payload: unknown, _secret?: unknown) => 'signed-payload';

export class SimulationResult {
  steps: unknown[] = [];
}

export const simulateJourney = (_journey: unknown, _tenantId: string, _context: unknown) => new SimulationResult();

export class ClearCooperationRisk {
  status = 'GREEN';
  hoursElapsed = 0;
  hoursRemaining = 0;
}

export const evaluateClearCooperation = () => new ClearCooperationRisk();

export class PreflightResult {
  pass = true;
  violations: unknown[] = [];
  warnings: unknown[] = [];
}

export const runPublishingPreflight = () => new PreflightResult();

export class AgentScore {
  userId = 'agent';
  fullName = 'Agent';
  score = 0;
  reasons: unknown[] = [];
}

export class AgentSnapshot {}
export class LeadRoutingConditions {}
export class LeadRoutingContext {}
export class LeadRoutingEvaluationResult {}
export class LeadRoutingFallback {}
export class LeadRoutingListingContext {}
export class LeadRoutingRuleConfig {}
export class LeadRoutingTarget {}
export class RoutingResult {
  selectedAgents: unknown[] = [];
  usedFallback = false;
  quietHours = false;
  assignment = null;
}

export const evaluateLeadRoutingConditions = stubFunction;
export const leadRoutingConditionsSchema = createSchema();
export const leadRoutingFallbackSchema = createSchema();
export const leadRoutingRuleConfigSchema = createSchema();
export const leadRoutingTargetSchema = createSchema();
export const routingConfigSchema = createSchema();
export const scoreAgent = () => ({ score: 0, reasons: [] });
export const routeLead = () => new RoutingResult();

export const buildCanonicalDraft = (_draft: unknown) => noopObject;

export class DraftMappingResult {}
export class ExtractedLabelValue {}

export const DomainEventBus = {
  publish: stubFunction
};

export default {
  makeDomainEvent,
  signPayload,
  simulateJourney,
  runPublishingPreflight,
  evaluateClearCooperation,
  evaluateLeadRoutingConditions,
  buildCanonicalDraft,
  scoreAgent,
  routeLead,
  leadRoutingConditionsSchema,
  leadRoutingTargetSchema,
  leadRoutingFallbackSchema,
  leadRoutingRuleConfigSchema,
  routingConfigSchema
};
