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

export type WalkthroughQuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
};

export type Walkthrough = {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  difficulty: WalkthroughDifficulty;
  steps: WalkthroughStep[];
  quiz?: WalkthroughQuizQuestion[];
};

export type WalkthroughSummary = Pick<
  Walkthrough,
  'id' | 'title' | 'description' | 'estimatedTime' | 'difficulty'
> & { totalSteps: number };

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

export type TrainingAnswer = {
  answer: string;
  relatedTimestamps: number[];
  suggestedPractice: string;
};

export type StepValidation = {
  passed: boolean;
  feedback: string;
  hint?: string;
  canRetry?: boolean;
  nextStep?: number;
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

