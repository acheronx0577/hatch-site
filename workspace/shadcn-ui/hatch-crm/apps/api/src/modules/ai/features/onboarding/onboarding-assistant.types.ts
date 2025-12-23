export type OnboardingChatRequest = {
  message: string;
};

export type OnboardingAction = {
  type: string;
  target?: string;
  value?: unknown;
  requiresConfirmation?: boolean;
};

export type OnboardingProgress = {
  currentStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  percent: number;
  totalSteps: number;
  done: boolean;
};

export type OnboardingChatResponse = {
  message: string;
  actions: OnboardingAction[];
  suggestedNextSteps: string[];
  questionsToAsk: string[];
  currentTopic: string;
  currentProgress: OnboardingProgress;
  requestId: string;
};

export type OnboardingUploadType = 'logo' | 'commission_schedule' | 'agent_roster';

export type OnboardingUploadRequest = {
  organizationId: string;
  userId: string;
  fileType: OnboardingUploadType;
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type OnboardingUploadResponse = {
  message: string;
  extractedData?: unknown;
  requiresConfirmation?: boolean;
};

export type ParsedAssistantResponse = {
  message: string;
  actions: OnboardingAction[];
  suggestedNextSteps: string[];
  currentTopic: string;
  questionsToAsk: string[];
};

