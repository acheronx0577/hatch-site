import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { FollowUpMessageService } from './follow-up-message.service';
import { FollowUpType } from './follow-up.types';

class GenerateEmailDto {
  @IsString()
  leadId!: string;

  @IsEnum(FollowUpType)
  followUpType!: FollowUpType;

  @IsOptional()
  @IsString()
  specificGoal?: string;
}

class GenerateTextDto {
  @IsString()
  leadId!: string;

  @IsEnum(FollowUpType)
  followUpType!: FollowUpType;

  @IsOptional()
  @IsString()
  brief?: string;
}

@ApiTags('ai-follow-up')
@ApiBearerAuth()
@Controller('ai/follow-up')
@UseGuards(JwtAuthGuard)
export class FollowUpController {
  constructor(private readonly followUps: FollowUpMessageService) {}

  @Post('email')
  async generateEmail(@Req() req: FastifyRequest, @Body() dto: GenerateEmailDto) {
    const ctx = resolveRequestContext(req);
    return this.followUps.generateEmail(ctx, dto);
  }

  @Post('text')
  async generateText(@Req() req: FastifyRequest, @Body() dto: GenerateTextDto) {
    const ctx = resolveRequestContext(req);
    return this.followUps.generateText(ctx, dto);
  }

  @Post(':requestId/send')
  async send(@Req() req: FastifyRequest, @Param('requestId') actionId: string) {
    const ctx = resolveRequestContext(req);
    return this.followUps.sendApproved(ctx, actionId);
  }
}
