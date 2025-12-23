import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Allow, IsBoolean, IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { ConversationSummaryService } from './conversation-summary.service';

class SummarizeConversationDto {
  @IsString()
  leadId!: string;

  @IsString()
  conversationId!: string;

  @IsOptional()
  @IsBoolean()
  autoUpdateLead?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateTasks?: boolean;
}

class ApplyAnalysisDto {
  @IsString()
  leadId!: string;

  @Allow()
  analysis!: unknown;

  @IsOptional()
  @IsBoolean()
  autoUpdateLead?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateTasks?: boolean;
}

@ApiTags('ai-summarize')
@ApiBearerAuth()
@Controller('ai/summarize')
@UseGuards(JwtAuthGuard)
export class SummarizeController {
  constructor(private readonly summaries: ConversationSummaryService) {}

  @Post('conversation')
  async summarizeConversation(@Req() req: FastifyRequest, @Body() dto: SummarizeConversationDto) {
    const ctx = resolveRequestContext(req);
    return this.summaries.summarizeConversation(ctx, dto);
  }

  @Post('lead/:leadId/all-conversations')
  async summarizeAllConversations(@Req() req: FastifyRequest, @Param('leadId') leadId: string) {
    const ctx = resolveRequestContext(req);
    return this.summaries.summarizeAllConversations(ctx, leadId);
  }

  @Post('conversation/:id/apply')
  async applyAnalysis(@Req() req: FastifyRequest, @Param('id') _conversationId: string, @Body() dto: ApplyAnalysisDto) {
    const ctx = resolveRequestContext(req);
    return this.summaries.applyAnalysis(ctx, dto.leadId, dto.analysis, {
      autoUpdateLead: Boolean(dto.autoUpdateLead),
      autoCreateTasks: Boolean(dto.autoCreateTasks)
    });
  }
}
