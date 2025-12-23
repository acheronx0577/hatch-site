import { apiFetch } from '@/lib/api';

export type WalkthroughDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type WalkthroughHighlightType = 'pulse' | 'spotlight' | 'outline';
export type WalkthroughTooltipPosition = 'top' | 'right' | 'bottom' | 'left';

export type WalkthroughExpectedAction =
  | { type: 'click'; target: string }
  | { type: 'input'; target: string; minLength?: number }
  | { type: 'form-complete'; target: string };

export type WalkthroughStep = {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  highlightType: WalkthroughHighlightType;
  tooltipPosition: WalkthroughTooltipPosition;
  expectedAction: WalkthroughExpectedAction;
  skippable: boolean;
  practiceMode?: {
    sampleData?: string;
    [key: string]: unknown;
  };
};

export type WalkthroughSummary = {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  difficulty: WalkthroughDifficulty;
  totalSteps: number;
};

export type WalkthroughSession = {
  sessionId: string;
  feature: string;
  totalSteps: number;
  currentStep: number;
  steps: WalkthroughStep[];
};

export type StepGuidance = {
  instruction: string;
  targetElement: string;
  highlightType: WalkthroughHighlightType;
  tooltipPosition: WalkthroughTooltipPosition;
  canSkip: boolean;
  practiceMode?: WalkthroughStep['practiceMode'];
};

export type StepValidation = {
  passed: boolean;
  feedback: string;
  hint?: string;
  canRetry?: boolean;
  nextStep?: number;
};

export type TrainingAnswer = {
  answer: string;
  relatedTimestamps: number[];
  suggestedPractice: string;
};

export type PracticeScenario = {
  scenarioTitle: string;
  situation: string;
  sampleData: Record<string, unknown>;
  goal: string;
  successCriteria: string[];
  hints?: string[];
};

export type PracticeResult = {
  passed: boolean;
  score: number;
  feedback: string;
};

export type TrainingVideoSummary = {
  id: string;
  title: string;
  description: string;
  feature: string;
  durationSeconds: number;
};

export type VideoIndex = {
  chapters: Array<{ title: string; startSeconds: number; endSeconds?: number; summary?: string }>;
  keywords?: string[];
};

export type VideoAnswer = {
  answer: string;
  relatedMoments: Array<{ timestamp: number; label: string }>;
  tryItNowLink: string;
};

export async function listWalkthroughs(): Promise<WalkthroughSummary[]> {
  return apiFetch<WalkthroughSummary[]>('training/walkthroughs');
}

export async function startWalkthrough(feature: string): Promise<WalkthroughSession> {
  return apiFetch<WalkthroughSession>(`training/walkthroughs/${encodeURIComponent(feature)}/start`, {
    method: 'POST'
  });
}

export async function getStepGuidance(params: {
  sessionId: string;
  stepIndex: number;
  completedSteps?: string[];
  userRole?: string;
}): Promise<StepGuidance> {
  return apiFetch<StepGuidance>(`training/walkthroughs/session/${encodeURIComponent(params.sessionId)}/step/${params.stepIndex}`, {
    method: 'POST',
    body: {
      completedSteps: params.completedSteps,
      userRole: params.userRole
    }
  });
}

export async function validateWalkthroughStep(params: {
  sessionId: string;
  stepIndex: number;
  userAction: unknown;
  resultingState?: unknown;
}): Promise<StepValidation> {
  return apiFetch<StepValidation>(`training/walkthroughs/session/${encodeURIComponent(params.sessionId)}/validate`, {
    method: 'POST',
    body: {
      stepIndex: params.stepIndex,
      userAction: params.userAction,
      resultingState: params.resultingState
    }
  });
}

export async function askDuringWalkthrough(params: {
  sessionId: string;
  question: string;
  videoTimestamp?: number;
}): Promise<TrainingAnswer> {
  return apiFetch<TrainingAnswer>(`training/walkthroughs/session/${encodeURIComponent(params.sessionId)}/ask`, {
    method: 'POST',
    body: {
      question: params.question,
      videoTimestamp: params.videoTimestamp
    }
  });
}

export async function listTrainingVideos(): Promise<TrainingVideoSummary[]> {
  return apiFetch<TrainingVideoSummary[]>('training/videos');
}

export async function getVideoIndex(videoId: string): Promise<VideoIndex> {
  return apiFetch<VideoIndex>(`training/videos/${encodeURIComponent(videoId)}/index`);
}

export async function askAboutVideoMoment(params: { videoId: string; timestamp: number; question: string }): Promise<VideoAnswer> {
  return apiFetch<VideoAnswer>(`training/videos/${encodeURIComponent(params.videoId)}/ask`, {
    method: 'POST',
    body: {
      timestamp: params.timestamp,
      question: params.question
    }
  });
}

export async function generatePracticeScenario(params: {
  feature: string;
  difficulty?: string;
  completedTrainings?: string[];
}): Promise<PracticeScenario> {
  return apiFetch<PracticeScenario>(`training/practice/${encodeURIComponent(params.feature)}`, {
    method: 'POST',
    body: {
      difficulty: params.difficulty,
      completedTrainings: params.completedTrainings
    }
  });
}

export async function checkPractice(params: {
  sessionId: string;
  submission?: Record<string, unknown>;
}): Promise<PracticeResult> {
  return apiFetch<PracticeResult>(`training/practice/${encodeURIComponent(params.sessionId)}/check`, {
    method: 'POST',
    body: { submission: params.submission }
  });
}

