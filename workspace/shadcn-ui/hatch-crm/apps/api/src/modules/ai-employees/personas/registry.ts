export type AiPersonaId =
  | 'brokerAssistant'
  | 'agentCopilot'
  | 'docClassifier'
  | 'docComplianceChecker'
  | 'playbookGenerator'
  | 'timelineSummarizer'
  | 'brokerCoach'
  | 'hatchAssistant'
  | 'transactionCoordinator'
  | 'leadNurtureWriter'
  | 'leadScorer'
  | 'revenueForecaster';

export type AiPersonaConfig = {
  id: AiPersonaId;
  name: string;
  description: string;
  model: string;
  temperature: number;
  tools: string[];
  collectors: string[];
};

const DEFAULT_GROK_MODEL =
  process.env.AI_MODEL_GROK ?? process.env.XAI_MODEL ?? process.env.GROK_MODEL ?? 'grok-4-1-fast-reasoning';

export const AI_PERSONA_REGISTRY: Record<AiPersonaId, AiPersonaConfig> = {
  brokerAssistant: {
    id: 'brokerAssistant',
    name: 'Broker Assistant',
    description:
      'Helps brokers understand compliance, risk, listings, and operations across the brokerage.',
    model: process.env.AI_BROKER_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: ['leads', 'listings', 'transactions', 'rentals', 'compliance', 'financials'],
    collectors: ['orgSummary', 'orgRiskSnapshot']
  },
  agentCopilot: {
    id: 'agentCopilot',
    name: 'Agent Copilot',
    description: 'Provides daily briefings and suggested actions for individual agents.',
    model: process.env.AI_COPILOT_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.3,
    tools: ['leads', 'listings', 'tasks'],
    collectors: ['agentContext', 'agentPipelineSnapshot']
  },
  docClassifier: {
    id: 'docClassifier',
    name: 'Document Classifier',
    description: 'Classifies uploaded brokerage documents by purpose.',
    model: process.env.AI_DOC_CLASSIFIER_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.1,
    tools: [],
    collectors: []
  },
  docComplianceChecker: {
    id: 'docComplianceChecker',
    name: 'Document Compliance Checker',
    description: 'Reviews documents for compliance issues across listings, transactions, and rentals.',
    model: process.env.AI_DOC_COMPLIANCE_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: ['listingContext', 'transactionContext', 'rentalContext']
  },
  playbookGenerator: {
    id: 'playbookGenerator',
    name: 'Automation Builder',
    description: 'Converts natural language instructions into playbook triggers, conditions, and actions.',
    model: process.env.AI_PLAYBOOK_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: ['orgSummary']
  },
  timelineSummarizer: {
    id: 'timelineSummarizer',
    name: 'Timeline Summarizer',
    description: 'Summarizes entity timelines into broker-friendly narratives.',
    model: process.env.AI_TIMELINE_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: []
  },
  brokerCoach: {
    id: 'brokerCoach',
    name: 'Broker Coach',
    description: 'Provides coaching insights across agents, teams, listings, compliance, risk, and productivity.',
    model: process.env.AI_COACH_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: [
      'orgSummary',
      'officeSummary',
      'teamSummary',
      'agentPipelineSnapshot',
      'listingSummary',
      'transactionSummary',
      'complianceSummary',
      'presenceSummary'
    ]
  },
  hatchAssistant: {
    id: 'hatchAssistant',
    name: 'Hatch Assistant',
    description:
      'Answers questions about the brokerage using search, timelines, insights, documents, and recent activity. Can propose next actions.',
    model: process.env.AI_ASSISTANT_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: ['orgSummary', 'officeSummary', 'teamSummary', 'liveActivity', 'reportingSummary']
  },
  transactionCoordinator: {
    id: 'transactionCoordinator',
    name: 'Transaction Coordinator',
    description:
      'Monitors transactions, documents, and deadlines; suggests and triggers TC tasks via playbooks.',
    model: process.env.AI_ASSISTANT_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: [
      'transactionSummary',
      'listingContext',
      'documentComplianceSummary',
      'timelineForTransaction',
      'orgSummary',
      'performanceSummary'
    ]
  },
  leadNurtureWriter: {
    id: 'leadNurtureWriter',
    name: 'Lead Nurture Writer',
    description: "Writes follow-up emails and texts based on a lead's profile and timeline.",
    model: process.env.AI_COPILOT_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: ['leadContext', 'timelineForLead']
  },
  leadScorer: {
    id: 'leadScorer',
    name: 'Lead Scoring AI',
    description: 'Scores leads and predicts conversion likelihood.',
    model: process.env.AI_COPILOT_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: ['leadContext', 'agentPerformanceSnapshot', 'timelineForLead', 'orgSummary']
  },
  revenueForecaster: {
    id: 'revenueForecaster',
    name: 'Revenue Forecaster',
    description: 'Predicts brokerage revenue and pipeline dynamics.',
    model: process.env.AI_ASSISTANT_MODEL ?? DEFAULT_GROK_MODEL,
    temperature: 0.2,
    tools: [],
    collectors: ['transactionSummary', 'listingSummary', 'orgSummary', 'performanceSummary']
  }
};
