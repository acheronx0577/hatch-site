import { BadRequestException, Controller, Get, Param, Post, Req, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { IsString } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { OnboardingAssistantService } from './onboarding-assistant.service';
import type { OnboardingAction, OnboardingUploadType } from './onboarding-assistant.types';

class ChatDto {
  @IsString()
  message!: string;
}

@ApiTags('onboarding-assistant')
@ApiBearerAuth()
@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard('broker'))
export class OnboardingAssistantController {
  constructor(private readonly onboarding: OnboardingAssistantService) {}

  @Post('chat')
  async chat(@Req() req: FastifyRequest, @Body() dto: ChatDto) {
    const ctx = resolveRequestContext(req);
    return this.onboarding.chat(ctx, dto.message);
  }

  @Get('state')
  async getState(@Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.onboarding.getState(ctx);
  }

  @Post('configure')
  async configure(@Req() req: FastifyRequest, @Body() body: { actions?: OnboardingAction[] }) {
    const ctx = resolveRequestContext(req);
    const actions = Array.isArray(body?.actions) ? body.actions : [];
    return this.onboarding.configure(ctx, actions);
  }

  @Post('skip/:step')
  async skipStep(@Req() req: FastifyRequest, @Param('step') step: string) {
    const ctx = resolveRequestContext(req);
    await this.onboarding.skipStep(ctx, step);
    return { ok: true };
  }

  @Post('complete')
  async complete(@Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    await this.onboarding.complete(ctx);
    return { ok: true };
  }

  @Post('upload/:type')
  async upload(@Req() req: FastifyRequest, @Param('type') type: OnboardingUploadType) {
    const ctx = resolveRequestContext(req);
    const orgId = ctx.orgId?.trim();
    if (!orgId) {
      throw new BadRequestException('Missing organization context');
    }
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw new BadRequestException('Missing user context');
    }

    const fileType = (type ?? '').trim() as OnboardingUploadType;
    if (!['logo', 'commission_schedule', 'agent_roster'].includes(fileType)) {
      throw new BadRequestException('Invalid upload type');
    }

    const file = await this.consumeFile(req);
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const buffer = await file.toBuffer();

    return this.onboarding.handleUpload({
      organizationId: orgId,
      userId,
      fileType,
      filename: file.filename,
      mimeType: file.mimetype,
      buffer
    });
  }

  private async consumeFile(req: FastifyRequest): Promise<MultipartFile | undefined> {
    try {
      return await (req as FastifyRequest & { file: () => Promise<MultipartFile> }).file();
    } catch (error) {
      throw new BadRequestException(`Unable to process uploaded file: ${(error as Error).message}`);
    }
  }
}

