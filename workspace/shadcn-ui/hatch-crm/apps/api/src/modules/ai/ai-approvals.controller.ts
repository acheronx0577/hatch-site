import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CursorPaginationQueryDto } from '@/modules/common';
import { resolveRequestContext } from '@/modules/common';
import { AiApprovalService, type ApprovalStatus } from './foundation/services/ai-approval.service';
import { AiFeature } from './foundation/types/ai-request.types';

class PendingActionsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'executed', 'expired', 'superseded'])
  status?: ApprovalStatus;

  @IsOptional()
  @IsIn(Object.values(AiFeature))
  feature?: AiFeature;

  @IsOptional()
  @IsString()
  actionType?: string;
}

class ApproveDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

class RejectDto {
  @IsString()
  reason!: string;
}

class RegenerateDto {
  @IsString()
  generatedContent!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('ai/pending-actions')
@UseGuards(JwtAuthGuard)
export class AiPendingActionsController {
  constructor(private readonly approvals: AiApprovalService) {}

  @Get()
  async list(@Query() query: PendingActionsQueryDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.approvals.getPending(ctx.orgId, {
      limit: query.limit,
      cursor: query.cursor,
      filters: {
        status: query.status,
        feature: query.feature,
        actionType: query.actionType
      }
    });
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() dto: ApproveDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    await this.approvals.approve(id, ctx.userId, dto.notes);
    return { ok: true };
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    await this.approvals.reject(id, ctx.userId, dto.reason);
    return { ok: true };
  }

  @Post(':id/regenerate')
  async regenerate(@Param('id') id: string, @Body() dto: RegenerateDto) {
    const action = await this.approvals.regenerate(id, { generatedContent: dto.generatedContent, notes: dto.notes });
    return { ok: true, action };
  }

  @Post(':id/execute')
  async execute(@Param('id') id: string) {
    const result = await this.approvals.execute(id);
    return { ok: result.ok, result: result.executionResult ?? null };
  }
}

