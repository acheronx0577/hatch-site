import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';

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
export class MlsController {
  constructor(private readonly mls: MlsService) {}

  @Post('preflight')
  @ApiBody({ type: PublishingPreflightDto })
  @ApiOkResponse({
    description: 'Validation summary for the listing prior to publishing',
    schema: { type: 'object', additionalProperties: true }
  })
  async preflight(@Body() dto: PublishingPreflightDto) {
    return this.mls.preflight(dto);
  }

  @Post('clear-cooperation')
  @ApiBody({ type: ClearCooperationEventDto })
  @ApiOkResponse({ type: RecordClearCooperationResponseDto })
  async record(@Body() dto: ClearCooperationEventDto): Promise<RecordClearCooperationResponseDto> {
    const result = await this.mls.recordClearCooperation(dto);
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
  async profiles(@Query('tenantId') tenantId: string): Promise<MlsProfileListResponseDto> {
    const profiles = await this.mls.listProfiles(tenantId);
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
  async dashboard(@Query('tenantId') tenantId: string): Promise<ClearCooperationDashboardResponseDto> {
    const entries = await this.mls.getDashboard(tenantId);
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
