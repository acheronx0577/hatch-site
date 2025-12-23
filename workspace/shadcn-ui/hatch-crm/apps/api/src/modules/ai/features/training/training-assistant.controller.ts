import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { TrainingAssistantService } from './training-assistant.service';
import { VideoAssistantService } from './video-assistant.service';

@ApiTags('training-assistant')
@ApiBearerAuth()
@Controller('training')
@UseGuards(JwtAuthGuard)
export class TrainingAssistantController {
  constructor(
    private readonly training: TrainingAssistantService,
    private readonly video: VideoAssistantService
  ) {}

  // Walkthroughs
  @Get('walkthroughs')
  listWalkthroughs() {
    return this.training.listWalkthroughs();
  }

  @Post('walkthroughs/:feature/start')
  async startWalkthrough(@Param('feature') feature: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    return this.training.startWalkthrough({ feature, userId: ctx.userId, brokerageId: ctx.orgId });
  }

  @Post('walkthroughs/session/:sessionId/step/:stepIndex')
  async getStepGuidance(
    @Param('sessionId') sessionId: string,
    @Param('stepIndex') stepIndex: string,
    @Req() req: FastifyRequest,
    @Body() body?: { completedSteps?: string[]; userRole?: string }
  ) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    const step = Number(stepIndex);
    if (!Number.isFinite(step) || step < 0) {
      throw new BadRequestException('stepIndex must be a non-negative number');
    }

    return this.training.getStepGuidance({
      sessionId,
      stepIndex: step,
      userId: ctx.userId,
      brokerageId: ctx.orgId,
      userRole: body?.userRole ?? String(ctx.role ?? 'unknown'),
      completedSteps: Array.isArray(body?.completedSteps) ? body?.completedSteps : undefined
    });
  }

  @Post('walkthroughs/session/:sessionId/validate')
  async validateStep(
    @Param('sessionId') sessionId: string,
    @Req() req: FastifyRequest,
    @Body()
    body: {
      stepIndex: number;
      userAction: unknown;
      resultingState?: unknown;
    }
  ) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    const stepIndex = Number(body?.stepIndex);
    if (!Number.isFinite(stepIndex) || stepIndex < 0) {
      throw new BadRequestException('stepIndex must be a non-negative number');
    }

    return this.training.validateStep({
      sessionId,
      stepIndex,
      userId: ctx.userId,
      brokerageId: ctx.orgId,
      userAction: body?.userAction,
      resultingState: body?.resultingState
    });
  }

  @Post('walkthroughs/session/:sessionId/ask')
  async askDuringWalkthrough(
    @Param('sessionId') sessionId: string,
    @Req() req: FastifyRequest,
    @Body() body: { question: string; videoTimestamp?: number }
  ) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    return this.training.askDuringTraining({
      sessionId,
      userId: ctx.userId,
      brokerageId: ctx.orgId,
      question: body?.question,
      videoTimestamp: body?.videoTimestamp
    });
  }

  // Videos
  @Get('videos')
  listVideos() {
    return this.video.listVideos();
  }

  @Get('videos/:videoId/index')
  async getVideoIndex(@Param('videoId') videoId: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    return this.video.getVideoIndex({ videoId, userId: ctx.userId, brokerageId: ctx.orgId });
  }

  @Post('videos/:videoId/ask')
  async askAboutVideo(
    @Param('videoId') videoId: string,
    @Req() req: FastifyRequest,
    @Body() body: { timestamp: number; question: string }
  ) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    return this.video.askAboutVideoMoment({
      videoId,
      timestamp: body?.timestamp,
      question: body?.question,
      userId: ctx.userId,
      brokerageId: ctx.orgId
    });
  }

  // Practice
  @Post('practice/:feature')
  async generatePractice(
    @Param('feature') feature: string,
    @Req() req: FastifyRequest,
    @Body() body?: { difficulty?: string; completedTrainings?: string[] }
  ) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    return this.training.generatePracticeScenario({
      feature,
      difficulty: body?.difficulty,
      completedTrainings: Array.isArray(body?.completedTrainings) ? body.completedTrainings : undefined,
      userId: ctx.userId,
      brokerageId: ctx.orgId
    });
  }

  @Post('practice/:sessionId/check')
  async checkPractice(
    @Param('sessionId') sessionId: string,
    @Req() req: FastifyRequest,
    @Body() body?: { submission?: Record<string, unknown> }
  ) {
    const ctx = resolveRequestContext(req);
    this.assertAuthed(ctx);
    return this.training.checkPractice({
      sessionId,
      userId: ctx.userId,
      brokerageId: ctx.orgId,
      submission: body?.submission
    });
  }

  private assertAuthed(ctx: { userId?: string; orgId?: string }) {
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw new BadRequestException('Missing user context');
    }
    const orgId = ctx.orgId?.trim();
    if (!orgId) {
      throw new BadRequestException('Missing organization context');
    }
  }
}

