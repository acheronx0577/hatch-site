export type ConversationSummaryAnalysis = {
  summary: string;
  keyPoints: string[];
  extractedData: {
    budget: { min: number | null; max: number | null };
    timeline: string | null;
    preferredAreas: string[];
    propertyType: string | null;
    bedrooms: { min: number | null; max: number | null };
    mustHaves: string[];
    dealBreakers: string[];
    preApproved: boolean | null;
    hasAgent: boolean | null;
    motivation: string | null;
    concerns: string[];
  };
  commitments: Array<{ by: 'agent' | 'client'; commitment: string; deadline: string | null }>;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  suggestedNextSteps: Array<{ action: string; priority: 'high' | 'medium' | 'low'; suggestedDate: string | null }>;
  questionsToAnswer: string[];
  followUpTopics: string[];
};

export type SummarizeConversationRequest = {
  leadId: string;
  conversationId: string;
  autoUpdateLead?: boolean;
  autoCreateTasks?: boolean;
};

export type ConversationSummaryResult = ConversationSummaryAnalysis & {
  requestId: string;
  leadUpdated: boolean;
  tasksCreated: number;
};

