import { apiFetch } from '@/lib/api';

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

export type OnboardingState = {
  id: string;
  organizationId: string;
  currentStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  conversationHistory: Array<{ role: string; content: string; at?: string }>;
  pendingConfig: unknown;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  lastActivityAt: string;
  totalMessages: number;
  totalTime?: number | null;
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

export type OnboardingStateResponse = {
  state: OnboardingState;
  progress: OnboardingProgress;
};

export type OnboardingUploadType = 'logo' | 'commission_schedule' | 'agent_roster';

export type OnboardingUploadResponse = {
  message: string;
  extractedData?: unknown;
  requiresConfirmation?: boolean;
};

export async function fetchOnboardingState(): Promise<OnboardingStateResponse> {
  return apiFetch<OnboardingStateResponse>('onboarding/state');
}

export async function onboardingChat(message: string): Promise<OnboardingChatResponse> {
  return apiFetch<OnboardingChatResponse>('onboarding/chat', {
    method: 'POST',
    body: { message }
  });
}

export async function onboardingConfigure(actions: OnboardingAction[]) {
  return apiFetch<{ ok: boolean; results: unknown[] }>('onboarding/configure', {
    method: 'POST',
    body: { actions }
  });
}

export async function onboardingSkip(step: string) {
  return apiFetch<{ ok: boolean }>(`onboarding/skip/${encodeURIComponent(step)}`, {
    method: 'POST'
  });
}

export async function onboardingComplete() {
  return apiFetch<{ ok: boolean }>('onboarding/complete', {
    method: 'POST'
  });
}

export async function onboardingUpload(type: OnboardingUploadType, file: File): Promise<OnboardingUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<OnboardingUploadResponse>(`onboarding/upload/${type}`, {
    method: 'POST',
    body: formData
  });
}

