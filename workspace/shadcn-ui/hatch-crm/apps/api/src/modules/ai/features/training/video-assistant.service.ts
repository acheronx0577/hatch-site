import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';

import type { TrainingVideoSummary, VideoAnswer, VideoIndex } from './training-assistant.types';
import { videoAssistantPrompt } from './training-assistant.prompt';
import { TrainingVideosRepository, type TrainingVideo } from './videos/training-videos.repository';

@Injectable()
export class VideoAssistantService {
  private readonly videosRepository = new TrainingVideosRepository();
  private promptStore: 'unknown' | 'available' | 'missing' = 'unknown';

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly prompts: AiPromptService
  ) {}

  listVideos(): TrainingVideoSummary[] {
    return this.videosRepository.list();
  }

  async getVideoIndex(params: { videoId: string; userId: string; brokerageId: string }): Promise<VideoIndex> {
    const video = this.getVideoOrThrow(params.videoId);

    const transcript = formatTranscript(video.transcript);

    const content = await this.completeJson({
      organizationId: params.brokerageId,
      userId: params.userId,
      feature: AiFeature.VIDEO_ASSISTANT,
      prompt: videoAssistantPrompt.videoIndex,
      variables: { transcript },
      options: { temperature: 0.2, maxTokens: 850 }
    });

    const parsed = safeJsonParse(content);
    const chapters = Array.isArray((parsed as any)?.chapters) ? (parsed as any).chapters : null;

    await this.touchTrainingProgress(params.userId);

    if (!chapters) {
      return {
        chapters: (video.chapters ?? []).map((chapter) => ({
          title: chapter.title,
          startSeconds: chapter.startSeconds,
          endSeconds: chapter.endSeconds
        }))
      };
    }

    const normalizedChapters = chapters
      .filter((chapter: any) => chapter && typeof chapter === 'object')
      .map((chapter: any) => ({
        title: String(chapter.title ?? 'Chapter'),
        startSeconds: Number(chapter.startSeconds ?? 0),
        endSeconds: chapter.endSeconds === undefined ? undefined : Number(chapter.endSeconds),
        summary: chapter.summary === undefined ? undefined : String(chapter.summary)
      }))
      .filter((chapter: any) => Number.isFinite(chapter.startSeconds) && chapter.startSeconds >= 0);

    const keywords = Array.isArray((parsed as any)?.keywords)
      ? (parsed as any).keywords.map((value: unknown) => String(value)).filter(Boolean)
      : undefined;

    return {
      chapters: normalizedChapters,
      keywords
    };
  }

  async askAboutVideoMoment(params: {
    videoId: string;
    timestamp: number;
    question: string;
    userId: string;
    brokerageId: string;
  }): Promise<VideoAnswer> {
    const question = (params.question ?? '').trim();
    if (!question) {
      throw new BadRequestException('question is required');
    }

    const timestamp = Number(params.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new BadRequestException('timestamp must be a non-negative number');
    }

    const video = this.getVideoOrThrow(params.videoId);

    const transcriptContext = getTranscriptWindow(video, timestamp, { beforeSeconds: 30, afterSeconds: 30 });
    const currentTopic = getTopicAtTimestamp(video, timestamp);

    const answer = await this.completeText({
      organizationId: params.brokerageId,
      userId: params.userId,
      feature: AiFeature.VIDEO_ASSISTANT,
      prompt: videoAssistantPrompt.videoQuestion,
      variables: {
        videoTitle: video.title,
        currentTopic,
        transcriptContext,
        timestamp: String(Math.floor(timestamp)),
        question
      },
      options: { temperature: 0.25, maxTokens: 280 }
    });

    await this.incrementQuestionsAsked(params.userId);

    return {
      answer,
      relatedMoments: findRelatedMoments(video, answer, timestamp),
      tryItNowLink: generateTryItNowLink(video.feature)
    };
  }

  private getVideoOrThrow(videoId: string): TrainingVideo {
    const id = (videoId ?? '').trim();
    if (!id) {
      throw new BadRequestException('videoId is required');
    }

    const video = this.videosRepository.get(id);
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    return video;
  }

  private async ensureVideoPrompts(organizationId: string, userId: string) {
    if (!(await this.canUsePromptStore())) {
      return;
    }
    await this.ensurePrompt(organizationId, userId, videoAssistantPrompt.videoQuestion);
    await this.ensurePrompt(organizationId, userId, videoAssistantPrompt.videoIndex);
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

  private async ensurePrompt(
    organizationId: string,
    userId: string,
    prompt: { name: string; systemPrompt: string; userPromptTemplate: string }
  ) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.VIDEO_ASSISTANT, name: prompt.name },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.VIDEO_ASSISTANT, {
        organizationId,
        name: prompt.name,
        systemPrompt: prompt.systemPrompt,
        userPromptTemplate: prompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 900,
        temperature: 0.2,
        description: `Video assistant prompt: ${prompt.name}`,
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.VIDEO_ASSISTANT, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.VIDEO_ASSISTANT, organizationId, existing.version);
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

function formatTranscript(cues: Array<{ startSeconds: number; text: string }>): string {
  return cues
    .filter((cue) => cue && Number.isFinite(cue.startSeconds) && typeof cue.text === 'string')
    .map((cue) => `[${formatTimestamp(cue.startSeconds)}] ${cue.text.trim()}`)
    .join('\n');
}

function getTranscriptWindow(
  video: TrainingVideo,
  timestamp: number,
  window: { beforeSeconds: number; afterSeconds: number }
): string {
  const before = Math.max(0, window.beforeSeconds);
  const after = Math.max(0, window.afterSeconds);
  const from = Math.max(0, timestamp - before);
  const to = timestamp + after;

  const cues = video.transcript
    .filter((cue) => cue.startSeconds >= from && cue.startSeconds <= to)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (cues.length === 0) {
    const nearest = [...video.transcript]
      .sort((a, b) => Math.abs(a.startSeconds - timestamp) - Math.abs(b.startSeconds - timestamp))
      .slice(0, 3)
      .sort((a, b) => a.startSeconds - b.startSeconds);
    return formatTranscript(nearest);
  }

  return formatTranscript(cues);
}

function getTopicAtTimestamp(video: TrainingVideo, timestamp: number): string {
  const chapters = video.chapters ?? [];
  if (chapters.length === 0) {
    return video.title;
  }

  const normalized = chapters
    .map((chapter, idx) => ({
      title: chapter.title,
      startSeconds: chapter.startSeconds,
      endSeconds:
        chapter.endSeconds ??
        (chapters[idx + 1]?.startSeconds !== undefined ? chapters[idx + 1].startSeconds : video.durationSeconds)
    }))
    .filter((chapter) => Number.isFinite(chapter.startSeconds));

  const found = normalized.find((chapter) => timestamp >= chapter.startSeconds && timestamp < (chapter.endSeconds ?? Infinity));
  return found?.title ?? video.title;
}

function findRelatedMoments(video: TrainingVideo, answer: string, timestamp: number): VideoAnswer['relatedMoments'] {
  const text = (answer ?? '').toLowerCase();
  const words = text
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 5);

  const stop = new Set([
    'about',
    'because',
    'before',
    'after',
    'click',
    'should',
    'could',
    'would',
    'where',
    'there',
    'these',
    'those',
    'hatch',
    'video',
    'training'
  ]);

  const keywords = Array.from(new Set(words.filter((word) => !stop.has(word)))).slice(0, 10);
  if (keywords.length === 0) {
    return [];
  }

  const scored = video.transcript
    .map((cue) => {
      const cueText = cue.text.toLowerCase();
      const matches = keywords.reduce((acc, keyword) => (cueText.includes(keyword) ? acc + 1 : acc), 0);
      const distance = Math.abs(cue.startSeconds - timestamp);
      return { cue, matches, distance };
    })
    .filter((entry) => entry.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.distance - b.distance)
    .slice(0, 3);

  return scored.map((entry) => ({
    timestamp: entry.cue.startSeconds,
    label: entry.cue.text.length > 64 ? `${entry.cue.text.slice(0, 61)}...` : entry.cue.text
  }));
}

function generateTryItNowLink(feature: string): string {
  const key = (feature ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    'create-listing': '/properties'
  };
  return map[key] ?? `/app?feature=${encodeURIComponent(key || 'training')}`;
}

function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
