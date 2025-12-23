import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';

import type {
  PracticeScenario,
  StepGuidance,
  StepValidation,
  TrainingAnswer,
  Walkthrough,
  WalkthroughExpectedAction,
  WalkthroughSession,
  WalkthroughSummary
} from './training-assistant.types';
import { trainingAssistantPrompt } from './training-assistant.prompt';
import { WalkthroughRepository } from './walkthroughs/walkthrough.repository';

type SessionState = {
  sessionId: string;
  userId: string;
  organizationId: string;
  walkthrough: Walkthrough;
  currentStep: number;
  createdAtMs: number;
};

@Injectable()
export class TrainingAssistantService {
  private readonly walkthroughRepository = new WalkthroughRepository();
  private readonly sessions = new Map<string, SessionState>();
  private promptStore: 'unknown' | 'available' | 'missing' = 'unknown';

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly prompts: AiPromptService
  ) {}

  listWalkthroughs(): WalkthroughSummary[] {
    return this.walkthroughRepository.list();
  }

  async startWalkthrough(params: { feature: string; userId: string; brokerageId: string }): Promise<WalkthroughSession> {
    const feature = (params.feature ?? '').trim();
    if (!feature) {
      throw new BadRequestException('feature is required');
    }

    const walkthrough = this.walkthroughRepository.findByFeature(feature);
    if (!walkthrough) {
      throw new NotFoundException('Walkthrough not found');
    }

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      sessionId,
      userId: params.userId,
      organizationId: params.brokerageId,
      walkthrough,
      currentStep: 0,
      createdAtMs: Date.now()
    });

    await this.touchTrainingProgress(params.userId);

    return {
      sessionId,
      feature: walkthrough.id,
      totalSteps: walkthrough.steps.length,
      currentStep: 0,
      steps: walkthrough.steps
    };
  }

  async getStepGuidance(params: {
    sessionId: string;
    stepIndex: number;
    userId: string;
    brokerageId: string;
    userRole?: string;
    completedSteps?: string[];
  }): Promise<StepGuidance> {
    const session = this.getSession(params.sessionId, params.userId, params.brokerageId);
    const step = session.walkthrough.steps[params.stepIndex];
    if (!step) {
      throw new NotFoundException('Step not found');
    }

    const variables = {
      stepTitle: step.title,
      stepDescription: step.description,
      targetElement: step.targetSelector,
      expectedAction: JSON.stringify(step.expectedAction),
      userRole: params.userRole ?? 'unknown',
      previousSteps: Array.isArray(params.completedSteps) ? params.completedSteps.join(', ') : ''
    };

    const instruction = await this.completeText({
      organizationId: params.brokerageId,
      userId: params.userId,
      feature: AiFeature.TRAINING_ASSISTANT,
      prompt: trainingAssistantPrompt.walkthroughStep,
      variables,
      options: { temperature: 0.35, maxTokens: 220 }
    });

    await this.touchTrainingProgress(params.userId);

    return {
      instruction,
      targetElement: step.targetSelector,
      highlightType: step.highlightType,
      tooltipPosition: step.tooltipPosition,
      canSkip: step.skippable,
      practiceMode: step.practiceMode
    };
  }

  async askDuringTraining(params: {
    sessionId: string;
    userId: string;
    brokerageId: string;
    question: string;
    videoTimestamp?: number;
  }): Promise<TrainingAnswer> {
    const question = (params.question ?? '').trim();
    if (!question) {
      throw new BadRequestException('question is required');
    }

    const session = this.getSession(params.sessionId, params.userId, params.brokerageId);
    const currentStep = session.walkthrough.steps[session.currentStep];
    const trainingMaterial = [
      `Walkthrough: ${session.walkthrough.title}`,
      `Description: ${session.walkthrough.description}`,
      currentStep ? `Current step: ${currentStep.title} — ${currentStep.description}` : null
    ]
      .filter(Boolean)
      .join('\n');

    const answer = await this.completeText({
      organizationId: params.brokerageId,
      userId: params.userId,
      feature: AiFeature.TRAINING_ASSISTANT,
      prompt: trainingAssistantPrompt.trainingQuestion,
      variables: {
        currentTopic: session.walkthrough.title,
        videoTimestamp: Number.isFinite(params.videoTimestamp) ? String(params.videoTimestamp) : '',
        question,
        trainingMaterial
      },
      options: { temperature: 0.2, maxTokens: 260 }
    });

    await this.incrementQuestionsAsked(params.userId);

    return {
      answer,
      relatedTimestamps: [],
      suggestedPractice: `Try replaying step ${Math.min(session.currentStep + 1, session.walkthrough.steps.length)} in practice mode.`
    };
  }

  async validateStep(params: {
    sessionId: string;
    stepIndex: number;
    userId: string;
    brokerageId: string;
    userAction: unknown;
    resultingState?: unknown;
  }): Promise<StepValidation> {
    const session = this.getSession(params.sessionId, params.userId, params.brokerageId);
    const step = session.walkthrough.steps[params.stepIndex];
    if (!step) {
      throw new NotFoundException('Step not found');
    }

    const validation = validateAction(step.expectedAction, params.userAction);
    if (!validation.passed) {
      const hint = await this.generateHint(params.brokerageId, params.userId, {
        stepTitle: step.title,
        expectedAction: step.expectedAction,
        userAction: params.userAction
      });

      return {
        passed: false,
        feedback: validation.reason ?? "That didn't match what the step expects.",
        hint,
        canRetry: true
      };
    }

    session.currentStep = Math.max(session.currentStep, params.stepIndex + 1);

    await this.touchTrainingProgress(params.userId);

    return {
      passed: true,
      feedback: "Great job! Let's move on to the next step.",
      nextStep: params.stepIndex + 1
    };
  }

  async generatePracticeScenario(params: {
    feature: string;
    difficulty?: string;
    completedTrainings?: string[];
    userId: string;
    brokerageId: string;
  }): Promise<PracticeScenario> {
    const feature = (params.feature ?? '').trim();
    if (!feature) {
      throw new BadRequestException('feature is required');
    }

    const content = await this.completeJson({
      organizationId: params.brokerageId,
      userId: params.userId,
      feature: AiFeature.TRAINING_ASSISTANT,
      prompt: trainingAssistantPrompt.practiceScenario,
      variables: {
        feature,
        difficulty: params.difficulty ?? 'beginner',
        userExperience: Array.isArray(params.completedTrainings) ? params.completedTrainings.join(', ') : ''
      },
      options: { temperature: 0.3, maxTokens: 700 }
    });

    const parsed = safeJsonParse(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('Practice scenario generation failed (invalid JSON)');
    }

    await this.touchTrainingProgress(params.userId);

    return {
      scenarioTitle: String((parsed as any).scenarioTitle ?? 'Practice Scenario'),
      situation: String((parsed as any).situation ?? ''),
      sampleData: ((parsed as any).sampleData ?? {}) as Record<string, unknown>,
      goal: String((parsed as any).goal ?? ''),
      successCriteria: Array.isArray((parsed as any).successCriteria)
        ? (parsed as any).successCriteria.map((value: unknown) => String(value))
        : [],
      hints: Array.isArray((parsed as any).hints) ? (parsed as any).hints.map((value: unknown) => String(value)) : undefined
    };
  }

  async checkPractice(params: {
    sessionId: string;
    userId: string;
    brokerageId: string;
    submission?: Record<string, unknown>;
  }): Promise<{ passed: boolean; score: number; feedback: string }> {
    // Phase 0: deterministic check placeholder.
    // We can upgrade this later to evaluate submission state against success criteria.
    const sessionId = (params.sessionId ?? '').trim();
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    await this.incrementPracticeSessions(params.userId);
    return { passed: true, score: 1, feedback: 'Practice session recorded.' };
  }

  private getSession(sessionId: string, userId: string, organizationId: string): SessionState {
    const id = (sessionId ?? '').trim();
    if (!id) {
      throw new BadRequestException('sessionId is required');
    }

    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundException('Training session not found');
    }

    if (session.userId !== userId) {
      throw new NotFoundException('Training session not found');
    }

    if (session.organizationId !== organizationId) {
      throw new NotFoundException('Training session not found');
    }

    // Simple TTL to prevent unbounded memory growth.
    const ttlMs = 2 * 60 * 60 * 1000;
    if (Date.now() - session.createdAtMs > ttlMs) {
      this.sessions.delete(id);
      throw new NotFoundException('Training session expired');
    }

    return session;
  }

  private async generateHint(
    organizationId: string,
    userId: string,
    input: { stepTitle: string; expectedAction: WalkthroughExpectedAction; userAction: unknown }
  ): Promise<string> {
    const text = (
      await this.completeText({
        organizationId,
        userId,
        feature: AiFeature.TRAINING_ASSISTANT,
        prompt: trainingAssistantPrompt.walkthroughHint,
        variables: {
          stepTitle: input.stepTitle,
          expectedAction: JSON.stringify(input.expectedAction),
          userAction: JSON.stringify(input.userAction ?? {})
        },
        options: { temperature: 0.2, maxTokens: 90 }
      })
    ).trim();
    return text.length > 0 ? text : 'Try the step again and make sure you click the highlighted element.';
  }

  private async completeText(params: {
    organizationId: string;
    userId: string;
    feature: AiFeature;
    prompt: { name: string; systemPrompt: string; userPromptTemplate: string };
    variables: Record<string, any>;
    options?: { temperature?: number; maxTokens?: number };
  }): Promise<string> {
    const canUsePromptStore = await this.canUsePromptStore();

    if (canUsePromptStore) {
      await this.ensurePrompt(params.organizationId, params.userId, params.prompt);
      const response = await this.aiService.complete({
        feature: params.feature,
        promptTemplate: params.prompt.name,
        variables: params.variables,
        userId: params.userId,
        brokerageId: params.organizationId,
        options: {
          responseFormat: 'text',
          temperature: params.options?.temperature,
          maxTokens: params.options?.maxTokens
        }
      });
      return response.content;
    }

    const userPrompt = this.prompts.interpolate(params.prompt.userPromptTemplate, params.variables);
    const result = await this.aiService.runStructuredChat({
      systemPrompt: params.prompt.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: params.options?.temperature,
      responseFormat: 'text'
    });
    return result.text ?? '';
  }

  private async completeJson(params: {
    organizationId: string;
    userId: string;
    feature: AiFeature;
    prompt: { name: string; systemPrompt: string; userPromptTemplate: string };
    variables: Record<string, any>;
    options?: { temperature?: number; maxTokens?: number };
  }): Promise<string> {
    const canUsePromptStore = await this.canUsePromptStore();

    if (canUsePromptStore) {
      await this.ensurePrompt(params.organizationId, params.userId, params.prompt);
      const response = await this.aiService.complete({
        feature: params.feature,
        promptTemplate: params.prompt.name,
        variables: params.variables,
        userId: params.userId,
        brokerageId: params.organizationId,
        options: {
          responseFormat: 'json_object',
          temperature: params.options?.temperature,
          maxTokens: params.options?.maxTokens
        }
      });
      return response.content;
    }

    const userPrompt = this.prompts.interpolate(params.prompt.userPromptTemplate, params.variables);
    const result = await this.aiService.runStructuredChat({
      systemPrompt: params.prompt.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: params.options?.temperature,
      responseFormat: 'json_object'
    });
    return result.text ?? '';
  }

  private async canUsePromptStore(): Promise<boolean> {
    if (this.promptStore === 'available') return true;
    if (this.promptStore === 'missing') return false;

    try {
      await this.prisma.aiPromptTemplate.findFirst({ select: { id: true } });
      this.promptStore = 'available';
      return true;
    } catch (error) {
      if (isMissingAiPromptTemplatesTable(error)) {
        this.promptStore = 'missing';
        return false;
      }
      throw error;
    }
  }

  private async ensureTrainingPrompts(organizationId: string, userId: string) {
    if (!(await this.canUsePromptStore())) {
      return;
    }
    await this.ensurePrompt(organizationId, userId, trainingAssistantPrompt.walkthroughStep);
    await this.ensurePrompt(organizationId, userId, trainingAssistantPrompt.trainingQuestion);
    await this.ensurePrompt(organizationId, userId, trainingAssistantPrompt.practiceScenario);
    await this.ensurePrompt(organizationId, userId, trainingAssistantPrompt.walkthroughHint);
  }

  private async ensurePrompt(
    organizationId: string,
    userId: string,
    prompt: { name: string; systemPrompt: string; userPromptTemplate: string }
  ) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.TRAINING_ASSISTANT, name: prompt.name },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.TRAINING_ASSISTANT, {
        organizationId,
        name: prompt.name,
        systemPrompt: prompt.systemPrompt,
        userPromptTemplate: prompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 800,
        temperature: 0.25,
        description: `Training assistant prompt: ${prompt.name}`,
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.TRAINING_ASSISTANT, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.TRAINING_ASSISTANT, organizationId, existing.version);
    }
  }

  private async touchTrainingProgress(userId: string) {
    const id = userId?.trim();
    if (!id) {
      return;
    }

    try {
      await this.prisma.userTrainingProgress.upsert({
        where: { userId: id },
        create: {
          userId: id,
          completedWalkthroughs: [],
          completedVideos: [],
          completedQuizzes: [],
          practiceSessionsCompleted: 0,
          practiceAccuracy: null,
          totalTrainingTime: 0,
          questionsAsked: 0,
          lastTrainingAt: new Date(),
          badges: []
        },
        update: { lastTrainingAt: new Date() }
      });
    } catch (error) {
      if (isMissingTrainingProgressTable(error)) {
        return;
      }
      throw error;
    }
  }

  private async incrementQuestionsAsked(userId: string) {
    const id = userId?.trim();
    if (!id) {
      return;
    }
    try {
      await this.prisma.userTrainingProgress.upsert({
        where: { userId: id },
        create: {
          userId: id,
          completedWalkthroughs: [],
          completedVideos: [],
          completedQuizzes: [],
          practiceSessionsCompleted: 0,
          practiceAccuracy: null,
          totalTrainingTime: 0,
          questionsAsked: 1,
          lastTrainingAt: new Date(),
          badges: []
        },
        update: {
          questionsAsked: { increment: 1 },
          lastTrainingAt: new Date()
        }
      });
    } catch (error) {
      if (isMissingTrainingProgressTable(error)) {
        return;
      }
      throw error;
    }
  }

  private async incrementPracticeSessions(userId: string) {
    const id = userId?.trim();
    if (!id) {
      return;
    }
    try {
      await this.prisma.userTrainingProgress.upsert({
        where: { userId: id },
        create: {
          userId: id,
          completedWalkthroughs: [],
          completedVideos: [],
          completedQuizzes: [],
          practiceSessionsCompleted: 1,
          practiceAccuracy: null,
          totalTrainingTime: 0,
          questionsAsked: 0,
          lastTrainingAt: new Date(),
          badges: []
        },
        update: {
          practiceSessionsCompleted: { increment: 1 },
          lastTrainingAt: new Date()
        }
      });
    } catch (error) {
      if (isMissingTrainingProgressTable(error)) {
        return;
      }
      throw error;
    }
  }
}

function isMissingTrainingProgressTable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2021', 'P2022', '42P01'].includes(error.code)
  );
}

function isMissingAiPromptTemplatesTable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2021', 'P2022', '42P01'].includes(error.code)
  );
}

function safeJsonParse(text: string): any | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function validateAction(expected: WalkthroughExpectedAction, actual: unknown): { passed: boolean; reason?: string } {
  const expType = expected?.type;
  const act = (actual ?? {}) as any;
  const actType = typeof act?.type === 'string' ? act.type : undefined;
  const actTarget = typeof act?.target === 'string' ? act.target : undefined;

  if (expType === 'click') {
    if (actType !== 'click') {
      return { passed: false, reason: 'Expected a click.' };
    }
    if (actTarget !== expected.target) {
      return { passed: false, reason: 'Click the highlighted element.' };
    }
    return { passed: true };
  }

  if (expType === 'input') {
    if (actType !== 'input') {
      return { passed: false, reason: 'Expected text input.' };
    }
    if (actTarget !== expected.target) {
      return { passed: false, reason: 'Type into the highlighted field.' };
    }
    const value = typeof act?.value === 'string' ? act.value : '';
    const min = typeof expected.minLength === 'number' ? expected.minLength : 0;
    if (min > 0 && value.trim().length < min) {
      return { passed: false, reason: `Enter at least ${min} characters.` };
    }
    return { passed: true };
  }

  if (expType === 'form-complete') {
    if (actType !== 'form-complete') {
      return { passed: false, reason: 'Complete the required fields in this section.' };
    }
    if (actTarget !== expected.target) {
      return { passed: false, reason: 'Complete the highlighted section.' };
    }
    return { passed: true };
  }

  return { passed: false, reason: 'Unsupported expected action.' };
}
