import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common';
import { ClearCooperationEventDto } from './dto/clear-coop.dto';
import { PublishingPreflightDto } from './dto/preflight.dto';
import { MlsService } from './mls.service';
import {
  ClearCooperationDashboardResponseDto,
  ClearCooperationDashboardEntryDto,
  MlsProfileDto,
  MlsProfileListResponseDto,
  RecordClearCooperationResponseDto
} from './dto/mls-response.dto';
import { ApiModule, ApiStandardErrors } from '../common';

@ApiModule('MLS')
@ApiStandardErrors()
@Controller('mls')
@UseGuards(JwtAuthGuard)
export class MlsController {
  constructor(private readonly mls: MlsService) {}

  @Post('preflight')
  @ApiBody({ type: PublishingPreflightDto })
  @ApiOkResponse({
    description: 'Validation summary for the listing prior to publishing',
    schema: { type: 'object', additionalProperties: true }
  })
  async preflight(@Req() req: FastifyRequest, @Body() dto: PublishingPreflightDto) {
    const ctx = resolveRequestContext(req);
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    return this.mls.preflight({ ...dto, tenantId: ctx.tenantId ?? dto.tenantId });
  }

  @Post('clear-cooperation')
  @ApiBody({ type: ClearCooperationEventDto })
  @ApiOkResponse({ type: RecordClearCooperationResponseDto })
  async record(@Req() req: FastifyRequest, @Body() dto: ClearCooperationEventDto): Promise<RecordClearCooperationResponseDto> {
    const ctx = resolveRequestContext(req);
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    const result = await this.mls.recordClearCooperation({ ...dto, tenantId: ctx.tenantId ?? dto.tenantId });
    return {
      timer: {
        id: result.timer.id,
        tenantId: result.timer.tenantId,
        listingId: result.timer.listingId,
        status: result.timer.status,
        startedAt: result.timer.startedAt.toISOString(),
        deadlineAt: result.timer.deadlineAt?.toISOString() ?? null,
        lastEventAt: result.timer.lastEventAt?.toISOString() ?? null
      },
      risk: {
        status: result.risk.status,
        hoursElapsed: result.risk.hoursElapsed,
        hoursRemaining: result.risk.hoursRemaining
      }
    };
  }

  @Get('profiles')
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiOkResponse({ type: MlsProfileListResponseDto })
  async profiles(@Req() req: FastifyRequest, @Query('tenantId') tenantId: string): Promise<MlsProfileListResponseDto> {
    const ctx = resolveRequestContext(req);
    if (tenantId && ctx.tenantId && tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    const profiles = await this.mls.listProfiles(ctx.tenantId ?? tenantId);
    const items = profiles.map((profile) => ({
      id: profile.id,
      tenantId: profile.tenantId,
      name: profile.name,
      disclaimerText: profile.disclaimerText ?? null,
      compensationDisplayRule: profile.compensationDisplayRule ?? null,
      clearCooperationRequired: profile.clearCooperationRequired,
      slaHours: profile.slaHours ?? null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString()
    } satisfies MlsProfileDto));
    return { items, nextCursor: null };
  }

  @Get('dashboard')
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiOkResponse({ type: ClearCooperationDashboardResponseDto })
  async dashboard(@Req() req: FastifyRequest, @Query('tenantId') tenantId: string): Promise<ClearCooperationDashboardResponseDto> {
    const ctx = resolveRequestContext(req);
    if (tenantId && ctx.tenantId && tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    const entries = await this.mls.getDashboard(ctx.tenantId ?? tenantId);
    const items = entries.map((entry) => ({
      timerId: entry.timerId,
      status: entry.status,
      startedAt: entry.startedAt.toISOString(),
      deadlineAt: entry.deadlineAt ? entry.deadlineAt.toISOString() : null,
      listing: entry.listing ? (entry.listing as unknown as Record<string, unknown>) : null
    } satisfies ClearCooperationDashboardEntryDto));
    return { items, nextCursor: null };
  }
}
